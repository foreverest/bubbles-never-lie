import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { ChartPreferences, ThemeMode } from '../types';

export const CHART_PREFERENCES_STORAGE_KEY = 'chart-preferences:v1';

export const DEFAULT_CHART_PREFERENCES: ChartPreferences = {
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
  if (!isPreferenceRecord(value)) {
    return DEFAULT_CHART_PREFERENCES;
  }

  return {
    currentUserRippleEnabled:
      typeof value.currentUserRippleEnabled === 'boolean'
        ? value.currentUserRippleEnabled
        : DEFAULT_CHART_PREFERENCES.currentUserRippleEnabled,
    themeMode: isThemeMode(value.themeMode)
      ? value.themeMode
      : DEFAULT_CHART_PREFERENCES.themeMode,
  };
}

type PreferenceRecord = {
  readonly [key: string]: unknown;
};

function isPreferenceRecord(value: unknown): value is PreferenceRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

function readStoredChartPreferences(): ChartPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_CHART_PREFERENCES;
  }

  try {
    const storedPreferences = window.localStorage.getItem(
      CHART_PREFERENCES_STORAGE_KEY
    );
    if (!storedPreferences) {
      return DEFAULT_CHART_PREFERENCES;
    }

    return normalizeChartPreferences(JSON.parse(storedPreferences));
  } catch {
    return DEFAULT_CHART_PREFERENCES;
  }
}

function writeStoredChartPreferences(preferences: ChartPreferences): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      CHART_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences)
    );
  } catch {
    // localStorage can be unavailable in embedded or privacy-restricted browsers.
  }
}
