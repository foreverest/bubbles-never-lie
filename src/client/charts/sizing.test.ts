import { expect, test } from 'vitest';

import {
  getContributorBubbleSize,
  getPostBubbleSize,
  getScaledBubbleSize,
} from './sizing';

test('clamps scaled bubble sizes', () => {
  expect(getScaledBubbleSize(-1)).toBe(10);
  expect(getScaledBubbleSize(0)).toBe(10);
  expect(getScaledBubbleSize(1)).toBe(72);
  expect(getScaledBubbleSize(2)).toBe(72);
});

test('scales post bubbles by square root of comment ratio', () => {
  expect(getPostBubbleSize(-10, 100)).toBe(10);
  expect(getPostBubbleSize(25, 100)).toBe(41);
  expect(getPostBubbleSize(100, 100)).toBe(72);
});

test('scales contributor bubbles by contribution ratio', () => {
  expect(getContributorBubbleSize(-1, 10)).toBe(10);
  expect(getContributorBubbleSize(5, 10)).toBe(41);
  expect(getContributorBubbleSize(10, 10)).toBe(72);
});
