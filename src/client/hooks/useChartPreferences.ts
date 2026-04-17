import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { ChartPreferences, ThemeMode } from '../types';

export const CHART_PREFERENCES_STORAGE_KEY = 'bubble-stats:chart-preferences:v1';

export const DEFAULT_CHART_PREFERENCES: ChartPreferences = {
  zoomEnabled: false,
  currentUserRippleEnabled: false,
  themeMode: 'system',
};

export function useChartPreferences(): [
  ChartPreferences,
  Dispatch<SetStateAction<ChartPreferences>>,
] {
  const [chartPreferences, setChartPreferences] = useState<ChartPreferences>(
    readStoredChartPreferences
  );

  useEffect(() => {
    writeStoredChartPreferences(chartPreferences);
  }, [chartPreferences]);

  return [chartPreferences, setChartPreferences];
}

export function normalizeChartPreferences(value: unknown): ChartPreferences {
  if (!value || typeof value !== 'object') {
    return DEFAULT_CHART_PREFERENCES;
  }

  const preferences = value as Partial<Record<keyof ChartPreferences, unknown>>;

  return {
    zoomEnabled:
      typeof preferences.zoomEnabled === 'boolean'
        ? preferences.zoomEnabled
        : DEFAULT_CHART_PREFERENCES.zoomEnabled,
    currentUserRippleEnabled:
      typeof preferences.currentUserRippleEnabled === 'boolean'
        ? preferences.currentUserRippleEnabled
        : DEFAULT_CHART_PREFERENCES.currentUserRippleEnabled,
    themeMode: isThemeMode(preferences.themeMode)
      ? preferences.themeMode
      : DEFAULT_CHART_PREFERENCES.themeMode,
  };
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

function readStoredChartPreferences(): ChartPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_CHART_PREFERENCES;
  }

  try {
    const storedPreferences = window.localStorage.getItem(CHART_PREFERENCES_STORAGE_KEY);
    if (!storedPreferences) {
      return DEFAULT_CHART_PREFERENCES;
    }

    return normalizeChartPreferences(JSON.parse(storedPreferences) as unknown);
  } catch {
    return DEFAULT_CHART_PREFERENCES;
  }
}

function writeStoredChartPreferences(preferences: ChartPreferences): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(CHART_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // localStorage can be unavailable in embedded or privacy-restricted browsers.
  }
}
