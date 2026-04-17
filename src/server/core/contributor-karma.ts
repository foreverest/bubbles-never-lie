import { SUBREDDIT_KARMA_BUCKET_COUNT } from '../../shared/api';
import type { SubredditKarmaBucket } from '../../shared/api';
import type { ContributorEntity } from '../data';

export const createContributorKarmaBuckets = (
  contributors: ContributorEntity[]
): Map<string, SubredditKarmaBucket> => {
  const knownContributors = contributors
    .flatMap((contributor) =>
      typeof contributor.subredditKarma === 'number' && Number.isFinite(contributor.subredditKarma)
        ? [{ contributorName: contributor.id, subredditKarma: contributor.subredditKarma }]
        : []
    )
    .sort(
      (a, b) =>
        a.subredditKarma - b.subredditKarma || a.contributorName.localeCompare(b.contributorName)
    );
  const contributorKarmaBuckets = new Map<string, SubredditKarmaBucket>();
  const maxContributorIndex = knownContributors.length - 1;

  knownContributors.forEach((contributor, index) => {
    const bucket =
      maxContributorIndex === 0
        ? SUBREDDIT_KARMA_BUCKET_COUNT - 1
        : Math.round((index / maxContributorIndex) * (SUBREDDIT_KARMA_BUCKET_COUNT - 1));

    contributorKarmaBuckets.set(contributor.contributorName, bucket as SubredditKarmaBucket);
  });

  return contributorKarmaBuckets;
};
