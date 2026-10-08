// The only web pages the app will open in the computer's browser. A page asks with
// `app:open-link`; the main process opens the link only if it passes `isAllowedLink`.
// Anything else (another site, another repository, a file) is refused.

const REPO = 'https://github.com/JoMoCodes/Loadout-Builder';

/** The help forum, where people ask questions in words. */
export const DISCUSSIONS_URL = `${REPO}/discussions`;

/** The page that lists every version of the app. */
export const RELEASES_URL = `${REPO}/releases`;

const RELEASE_PAGE = /^\/releases\/(latest|tag\/v\d{1,3}\.\d{1,3}\.\d{1,4}(-[0-9A-Za-z.]{1,20})?)$/;

/** True only for the help forum and the app's own release pages. */
export function isAllowedLink(link: unknown): boolean {
  if (typeof link !== 'string' || link.length > 200) return false;
  if (link === DISCUSSIONS_URL || link === RELEASES_URL) return true;
  if (!link.startsWith(`${REPO}/releases/`)) return false;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return false;
  }
  // The parsed link must say exactly what the text says: no tricks with dots, user names,
  // ports, question marks or #.
  if (url.href !== link || url.origin !== 'https://github.com') return false;
  if (url.search !== '' || url.hash !== '' || url.username !== '') return false;
  const rest = url.pathname.slice('/JoMoCodes/Loadout-Builder'.length);
  return RELEASE_PAGE.test(rest);
}
