import {
  CHART_PREFERENCES_STORAGE_KEY,
  normalizeChartPreferences,
} from './hooks/useChartPreferences';
import type { ThemeMode } from './types';

function readThemeMode(): ThemeMode {
  try {
    const storedPreferences = window.localStorage.getItem(
      CHART_PREFERENCES_STORAGE_KEY
    );
    const preferences = storedPreferences
      ? normalizeChartPreferences(JSON.parse(storedPreferences))
      : null;

    return preferences?.themeMode ?? 'system';
  } catch {
    return 'system';
  }
}

function resolveTheme(themeMode: ThemeMode): 'light' | 'dark' {
  const prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  return themeMode === 'dark' || (themeMode === 'system' && prefersDark)
    ? 'dark'
    : 'light';
}

const resolvedTheme = resolveTheme(readThemeMode());

document.documentElement.dataset.theme = resolvedTheme;
document.documentElement.style.colorScheme = resolvedTheme;
