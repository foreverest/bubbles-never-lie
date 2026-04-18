import { expect, test } from 'vitest';

import {
  CHART_PREFERENCES_STORAGE_KEY,
  normalizeChartPreferences,
} from './useChartPreferences';
import { resolveThemeMode } from './useResolvedTheme';

test('uses the app-local chart preferences storage key', () => {
  expect(CHART_PREFERENCES_STORAGE_KEY).toBe('chart-preferences:v1');
});

test('normalizes stored chart preferences that predate theme mode', () => {
  expect(
    normalizeChartPreferences({
      zoomEnabled: true,
      currentUserRippleEnabled: true,
    })
  ).toEqual({
    zoomEnabled: true,
    currentUserRippleEnabled: true,
    themeMode: 'system',
  });
});

test('normalizes invalid chart preference values to defaults', () => {
  expect(
    normalizeChartPreferences({
      zoomEnabled: 'yes',
      currentUserRippleEnabled: null,
      themeMode: 'night',
    })
  ).toEqual({
    zoomEnabled: false,
    currentUserRippleEnabled: false,
    themeMode: 'system',
  });
});

test('preserves valid theme modes when normalizing chart preferences', () => {
  expect(normalizeChartPreferences({ themeMode: 'system' }).themeMode).toBe(
    'system'
  );
  expect(normalizeChartPreferences({ themeMode: 'light' }).themeMode).toBe(
    'light'
  );
  expect(normalizeChartPreferences({ themeMode: 'dark' }).themeMode).toBe(
    'dark'
  );
});

test('resolves system theme mode from preferred color scheme', () => {
  expect(resolveThemeMode('system', true)).toBe('dark');
  expect(resolveThemeMode('system', false)).toBe('light');
  expect(resolveThemeMode('dark', false)).toBe('dark');
  expect(resolveThemeMode('light', true)).toBe('light');
});
