import { useEffect, useState } from 'react';

import type { ResolvedTheme, ThemeMode } from '../types';

const DARK_COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export function useResolvedTheme(themeMode: ThemeMode): ResolvedTheme {
  const [prefersDark, setPrefersDark] = useState(readPrefersDarkColorScheme);
  const resolvedTheme = resolveThemeMode(themeMode, prefersDark);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia(DARK_COLOR_SCHEME_QUERY);
    const handleChange = () => setPrefersDark(mediaQuery.matches);

    handleChange();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);

      return () => {
        mediaQuery.removeEventListener('change', handleChange);
      };
    }

    mediaQuery.addListener(handleChange);

    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  return resolvedTheme;
}

export function resolveThemeMode(themeMode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  return themeMode === 'dark' || (themeMode === 'system' && prefersDark) ? 'dark' : 'light';
}

function readPrefersDarkColorScheme(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(DARK_COLOR_SCHEME_QUERY).matches
  );
}
