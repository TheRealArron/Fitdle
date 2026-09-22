/*
 * Stamps the player's theme on <html> BEFORE the first paint.
 *
 * The settings store applies these attributes too, but it runs from a
 * useEffect, which is after hydration - so a player on the light theme got a
 * full dark-to-light flash on every single page load. Measured on /play before
 * this existed: body was rgb(10, 14, 24) at commit and rgb(245, 247, 250) once
 * hydrated.
 *
 * It also fixes a second thing: the landing page is a server component with no
 * settings store at all, so it never got the attributes and stayed dark
 * whatever the player had chosen. This runs on every page because it is in the
 * root layout.
 *
 * Deliberately a separate file rather than an inline script. The CSP allows
 * inline ('unsafe-inline' - see next.config.ts), so it would work, but the
 * codebase has no dangerouslySetInnerHTML anywhere and this is not the reason
 * to introduce the first one. A same-origin file also satisfies MV3's stricter
 * script-src 'self', so the extension build gets the fix for free.
 *
 * Kept tiny and synchronous on purpose: it must finish before the browser
 * paints, so it does no work beyond reading one key.
 */
(function () {
  try {
    var raw = window.localStorage.getItem('fitdle:settings:v1');
    if (!raw) return;
    var s = JSON.parse(raw);
    var themes = ['midnight', 'graphite', 'abyss', 'plum', 'daylight'];
    if (themes.indexOf(s.theme) !== -1) {
      document.documentElement.setAttribute('data-theme', s.theme);
    }
    if (s.colourblind === true) document.documentElement.setAttribute('data-colourblind', '');
    if (s.reduceMotion === true) document.documentElement.setAttribute('data-reduce-motion', '');
  } catch {
    /* Storage disabled or a corrupt record: the default theme is correct. */
  }
})();
