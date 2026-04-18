import { expect, test } from 'vitest';

import {
  createCommentsChartHelpDetails,
  createContributorsChartHelpDetails,
  createPostsChartHelpDetails,
} from './help';

test('posts chart help describes all visual encodings', () => {
  const details = createPostsChartHelpDetails();

  expect(details.items.map((item) => item.kind)).toEqual([
    'x-axis',
    'y-axis',
    'size',
    'color',
  ]);
  expect(details.items.map((item) => item.description)).toEqual([
    'Post creation time',
    'Post upvotes',
    'Comments on the post',
    'Author subreddit karma bucket',
  ]);
});

test('comments chart help omits bubble size and describes parent-post color', () => {
  const details = createCommentsChartHelpDetails();

  expect(details.items.map((item) => item.kind)).toEqual([
    'x-axis',
    'y-axis',
    'color',
  ]);
  expect(details.items.map((item) => item.description)).toEqual([
    'Comment creation time',
    'Comment upvotes',
    'Parent post',
  ]);
});

test('contributors chart help maps axes to comment and post upvotes', () => {
  const details = createContributorsChartHelpDetails();

  expect(details.items.map((item) => item.kind)).toEqual([
    'x-axis',
    'y-axis',
    'size',
    'color',
  ]);
  expect(details.items.map((item) => item.description)).toEqual([
    'Total comment upvotes',
    'Total post upvotes',
    'Posts and comments by contributor',
    'Contributor subreddit karma bucket',
  ]);
});
