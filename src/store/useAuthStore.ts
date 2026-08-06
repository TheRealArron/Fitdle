'use client';

import { create } from 'zustand';
import { friendlyAuthError, getSupabase, hasStoredSession, isCloudConfigured } from '@/lib/supabase';
import { pushCloudSave, syncSave } from '@/lib/cloudSync';
import { clearSave, defaultSave, loadSave, writeSave, type SaveData } from '@/lib/secureStorage';
import { useGameStore } from '@/store/useGameStore';

export interface AuthUser {
  id: string;
  email: string;
  /** Chosen at sign-up. Falls back to the email's local part for older accounts. */
  username: string;
}

/**
 * Stored in Supabase's `user_metadata`, not a table of our own.
 *
 * A display name is not relational data - nothing joins on it, and it belongs to
 * the identity rather than to progress. Keeping it on the auth user means no
 * extra table, no extra RLS policy, and it arrives with the session instead of
 * needing a second round trip before the sidebar can render.
 */
function toUser(u: { id: string; email?: string; user_metadata?: Record<string, unknown> }): AuthUser {
  const email = u.email ?? '';
  const meta = typeof u.user_metadata?.username === 'string' ? u.user_metadata.username : '';
  return { id: u.id, email, username: meta.trim() || email.split('@')[0] || 'Player' };
}

export type SyncState = 'idle' | 'syncing' | 'synced' | 'error';

export interface AuthState {
  /** False when the project has no Supabase keys - the app still works locally. */
  cloudAvailable: boolean;
  user: AuthUser | null;
  /** True until the initial session check settles, so the UI can avoid flicker. */
  loading: boolean;
  busy: boolean;
  error: string | null;
  /** Set after sign-up when the project requires email confirmation. */
  notice: string | null;
  syncState: SyncState;
  lastSyncedAt: number | null;

  /** Async: the auth SDK is fetched on demand. Callers fire and forget. */
  init: () => Promise<void>;
  signUp: (email: string, password: string, username: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  /** Push `save` over the cloud copy without merging. Used by reset. */
  overwriteCloud: (save: SaveData) => Promise<void>;
  clearError: () => void;
}

let unsubscribe: (() => void) | null = null;

export const useAuthStore = create<AuthState>()((set, get) => ({
  cloudAvailable: isCloudConfigured(),
  user: null,
  loading: true,
  busy: false,
  error: null,
  notice: null,
  syncState: 'idle',
  lastSyncedAt: null,

  init: async () => {
    if (!isCloudConfigured()) {
      set({ loading: false, cloudAvailable: false });
      return;
    }

    /*
     * The gate that makes the dynamic import worth anything.
     *
     * There is no session to restore, so there is nothing for the auth SDK to
     * do - and fetching it anyway would move the 59 kB off the critical path
     * without saving anyone the download. A signed-out player now never
     * requests it at all.
     *
     * Nothing is lost by deferring: `signIn` and `signUp` load the client
     * themselves, and this runs again once a session exists to attach the
     * cross-tab listener.
     */
    if (!hasStoredSession()) {
      set({ loading: false, user: null });
      return;
    }

    const supabase = await getSupabase();
    if (!supabase) {
      set({ loading: false, cloudAvailable: false });
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      set({ user: s?.user ? toUser(s.user) : null, loading: false });
      if (s?.user) void get().syncNow();
    });

    // Keeps multiple tabs and token refreshes in agreement.
    if (!unsubscribe) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        set({ user: session?.user ? toUser(session.user) : null });
      });
      unsubscribe = () => data.subscription.unsubscribe();
    }
  },

  signUp: async (email, password, username) => {
    const supabase = await getSupabase();
    if (!supabase) return false;
    set({ busy: true, error: null, notice: null });

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username.trim() } },
    });
    if (error) {
      set({ busy: false, error: friendlyAuthError(error.message) });
      return false;
    }

    // With "Confirm email" on (the Supabase default) there is no session yet.
    if (!data.session) {
      set({
        busy: false,
        notice: `Check ${email} for a confirmation link, then sign in.`,
      });
      return true;
    }

    set({ busy: false, user: data.user ? toUser(data.user) : null });

    /*
     * Re-run init now that a session exists.
     *
     * init() bails before touching the SDK when there is no stored session, so
     * a first-time sign-in on this device never got the cross-tab listener
     * attached. Calling it here restores that; the `unsubscribe` guard inside
     * keeps it from doubling up.
     */
    void get().init();
    await get().syncNow();
    return true;
  },

  /** Attaches the cross-tab listener once a session exists. */
  signIn: async (email, password) => {
    const supabase = await getSupabase();
    if (!supabase) return false;
    set({ busy: true, error: null, notice: null });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ busy: false, error: friendlyAuthError(error.message) });
      return false;
    }

    set({ busy: false, user: data.user ? toUser(data.user) : null });
    await get().syncNow();
    return true;
  },

  signOut: async () => {
    const supabase = await getSupabase();
    if (!supabase) return;
    set({ busy: true });

    const { user } = get();
    // Push first, so the last game of the session is not stranded here.
    if (user) await syncSave(user.id, loadSave().save);
    await supabase.auth.signOut();

    /*
     * Then wipe the local save.
     *
     * Sign-in deliberately MERGES local progress into the account, so that
     * someone who played anonymously keeps their streak when they sign up.
     * That is only correct if the local save belongs to the person signing in.
     * Leaving it behind means the next account on this device inherits the
     * previous one's stats - so signing out has to clear it. Nothing is lost:
     * it was just pushed to the cloud and comes back on the next sign-in.
     */
    clearSave();
    const fresh = defaultSave();
    writeSave(fresh);
    useGameStore.getState().initGame();

    set({ busy: false, user: null, syncState: 'idle', lastSyncedAt: null });
  },

  /**
   * Replaces the cloud copy outright instead of merging into it.
   *
   * Merging cannot express a deletion - every counter takes the max, so a
   * cleared save merged with the old cloud row restores it in full. "Reset
   * statistics" therefore has to overwrite, or it silently does nothing for
   * signed-in players.
   */
  overwriteCloud: async (save) => {
    const { user, cloudAvailable } = get();
    if (!cloudAvailable || !user) return;
    set({ syncState: 'syncing' });
    const result = await pushCloudSave(user.id, save);
    set(
      result.ok
        ? { syncState: 'synced', lastSyncedAt: Date.now() }
        : { syncState: 'error', error: result.error },
    );
  },

  /**
   * Pull, merge, push. The merged result is written to local storage and the
   * game store is re-initialised so the board and stats reflect it immediately.
   */
  syncNow: async () => {
    const { user } = get();
    if (!user) return;
    set({ syncState: 'syncing', error: null });

    const local = loadSave().save;
    const result = await syncSave(user.id, local);

    if (!result.ok) {
      // A failed sync is never fatal: local play continues untouched.
      set({ syncState: 'error', error: result.error });
      return;
    }

    writeSave(result.data);
    useGameStore.getState().initGame();
    set({ syncState: 'synced', lastSyncedAt: Date.now() });
  },

  clearError: () => set({ error: null, notice: null }),
}));

/**
 * Replaces the cloud copy outright. Used by "reset statistics", where merging
 * would restore exactly what the player asked to delete.
 */
export async function overwriteCloudIfSignedIn(save: SaveData): Promise<void> {
  const { user, cloudAvailable } = useAuthStore.getState();
  if (!cloudAvailable || !user) return;
  await useAuthStore.getState().overwriteCloud(save);
}

/**
 * No longer needed after a completed daily.
 *
 * `/api/guess` writes the authoritative record itself the moment the round
 * ends, and returns it. A client-side sync here would pull that fresh row back
 * down, merge it with the local copy, and re-display a number the browser
 * computed - which is what the server just took ownership of.
 *
 * Kept as a no-op rather than deleted so any straggling caller is inert instead
 * of a build error, and so the reason is recorded where someone would look for
 * it.
 */
export async function syncAfterGame(): Promise<void> {
  /* intentionally empty - the server banks the result */
}
