import { expect, test } from 'vitest';

import {
  getBubbleFillColor,
  getChartPaletteColor,
  getCommentGroupColor,
  getKarmaBucketColor,
  hexToRgb,
  toRgba,
} from './colors';

test('converts hex colors to RGB and RGBA', () => {
  expect(hexToRgb('#267c8c')).toEqual({ red: 38, green: 124, blue: 140 });
  expect(hexToRgb('invalid')).toBe(null);
  expect(toRgba({ red: 38, green: 124, blue: 140 }, 0.5)).toBe(
    'rgba(38, 124, 140, 0.5)'
  );
});

test('maps karma buckets and invalid palette indexes to stable colors', () => {
  expect(getKarmaBucketColor(null)).toBe('#9aa6b2');
  expect(getKarmaBucketColor(0)).toBe('#267c8c');
  expect(getChartPaletteColor(-1)).toBe('#267c8c');
});

test('creates cached bubble fill colors and deterministic comment colors', () => {
  expect(getBubbleFillColor('#d65a31', 0.9)).toBe('rgba(214, 90, 49, 0.9)');
  expect(getBubbleFillColor('not-hex', 0.5)).toBe('rgba(38, 124, 140, 0.5)');
  expect(getCommentGroupColor('post-1')).toBe(getCommentGroupColor('post-1'));
});
