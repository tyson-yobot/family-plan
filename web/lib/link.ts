/**
 * The last link this phone came in on, remembered.
 *
 * The reason it exists: the manifest's start_url is "/", so tapping the home
 * screen icon opens the bare landing page rather than the family board, and a
 * static manifest cannot hold a token that is different for each household
 * anyway. So the token is remembered on the way in and the landing page uses it
 * on the way back.
 *
 * It is not access control and must never be treated as any. It is the same
 * token that is already in the address bar, and it opens the family board,
 * which is names, statuses and dates. Everything private is behind a code and
 * this has nothing to do with that.
 *
 * It can be empty and that is a normal state, not a failure: a phone that added
 * this to its home screen before this existed has never stored one, and on iOS
 * a home-screen app does not always share storage with the browser it was added
 * from. The landing page has to read well with nothing here.
 */
const KEY = 'family-plan.link';

export function rememberLink(token: string): void {
  if (typeof window === 'undefined' || !token) return;
  try {
    window.localStorage.setItem(KEY, token);
  } catch {
    // Storage off. The link in the address bar still works; only the shortcut
    // back from the landing page is lost, and nothing on screen depends on it.
  }
}

export function lastLink(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
