/**
 * Launch-animation preference. Kept in localStorage (not the database) because
 * it has to be known before storage starts. If storage access fails, defaults apply.
 */
const PREF_KEY = 'ms.splash';
const SHOWN_KEY = 'ms.splashShown';

export function splashEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSplashEnabled(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
  } catch {
    /* preference simply not remembered */
  }
}

/** Once per app launch / browser session; never during automated tests. */
export function shouldShowSplash(): boolean {
  if (navigator.webdriver || !splashEnabled()) return false;
  try {
    if (sessionStorage.getItem(SHOWN_KEY)) return false;
    sessionStorage.setItem(SHOWN_KEY, '1');
  } catch {
    /* show it anyway */
  }
  return true;
}
