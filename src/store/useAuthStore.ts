'use client';

import { create } from 'zustand';
import { friendlyAuthError, getSupabase, isCloudConfigured } from '@/lib/supabase';
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
 * A display name is not relational data — nothing joins on it, and it belongs to
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
  /** False when the project has no Supabase keys — the app still works locally. */
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

  init: () => void;
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

  init: () => {
    const supabase = getSupabase();
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
    const supabase = getSupabase();
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
    await get().syncNow();
    return true;
  },

  signIn: async (email, password) => {
    const supabase = getSupabase();
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
    const supabase = getSupabase();
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
     * previous one's stats — so signing out has to clear it. Nothing is lost:
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
   * Merging cannot express a deletion — every counter takes the max, so a
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

/** Pushes local progress to the cloud after a completed daily, if signed in. */
export async function syncAfterGame(): Promise<void> {
  const { user, cloudAvailable } = useAuthStore.getState();
  if (!cloudAvailable || !user) return;
  await useAuthStore.getState().syncNow();
}
