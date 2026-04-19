import {
  COMMENT_GIF_PREVIEW_MARKER,
  COMMENT_IMAGE_PREVIEW_MARKER,
  resolveUserAvatarUrl,
} from '../../shared/api';
import TOOLTIP_COMMENT_ICON from '../assets/icons/tooltip-comment.svg?raw';
import TOOLTIP_DOWNVOTE_ICON from '../assets/icons/tooltip-downvote.svg?raw';
import TOOLTIP_POST_ICON from '../assets/icons/tooltip-post.svg?raw';
import TOOLTIP_UPVOTE_ICON from '../assets/icons/tooltip-upvote.svg?raw';
import { formatRelativeAge } from '../utils/date';
import { escapeHtml } from '../utils/html';
import type {
  CommentBubbleDatum,
  ContributorBubbleDatum,
  PostBubbleDatum,
} from './types';

type TooltipVariant = 'light' | 'dark';

export function renderPostTooltip(
  datum: PostBubbleDatum,
  variant: TooltipVariant = 'light'
): string {
  const createdAgo = formatRelativeAge(new Date(datum.createdAt), {
    labelStyle: 'long',
  });

  return [
    `<article class="chart-tooltip chart-tooltip--${variant} chart-tooltip--post">`,
    '<div class="chart-tooltip__meta">',
    renderTooltipAvatar(datum.authorAvatarUrl),
    `<span class="chart-tooltip__username">u/${escapeHtml(datum.authorName)}</span>`,
    renderCurrentUserTooltipBadge(datum.isCurrentUser),
    '<span aria-hidden="true" class="chart-tooltip__separator">&middot;</span>',
    `<span class="chart-tooltip__age">${escapeHtml(createdAgo)}</span>`,
    '</div>',
    `<strong class="chart-tooltip__title">${escapeHtml(datum.title)}</strong>`,
    '<div class="chart-tooltip__stats">',
    renderTooltipVotePill(datum.score),
    renderTooltipCommentPill(datum.comments),
    '</div>',
    '</article>',
  ].join('');
}

export function renderCommentTooltip(
  datum: CommentBubbleDatum,
  variant: TooltipVariant = 'light'
): string {
  const createdAgo = formatRelativeAge(new Date(datum.createdAt), {
    labelStyle: 'long',
  });

  return [
    `<article class="chart-tooltip chart-tooltip--${variant} chart-tooltip--comment">`,
    '<div class="chart-tooltip__meta">',
    renderTooltipAvatar(datum.authorAvatarUrl),
    `<span class="chart-tooltip__username">u/${escapeHtml(datum.authorName)}</span>`,
    renderCurrentUserTooltipBadge(datum.isCurrentUser),
    '<span aria-hidden="true" class="chart-tooltip__separator">&middot;</span>',
    `<span class="chart-tooltip__age">${escapeHtml(createdAgo)}</span>`,
    '</div>',
    renderCommentTooltipTitle(datum),
    '<div class="chart-tooltip__stats">',
    renderTooltipInlineVoteMetric(datum.score),
    '</div>',
    '</article>',
  ].join('');
}

export function renderContributorTooltip(
  datum: ContributorBubbleDatum,
  variant: TooltipVariant = 'light'
): string {
  return [
    `<article class="chart-tooltip chart-tooltip--${variant} chart-tooltip--contributor">`,
    '<div class="chart-tooltip__meta">',
    renderTooltipAvatar(datum.contributorAvatarUrl),
    `<span class="chart-tooltip__username">u/${escapeHtml(datum.contributorName)}</span>`,
    renderCurrentUserTooltipBadge(datum.isCurrentUser),
    '</div>',
    '<div class="chart-tooltip__stats chart-tooltip__contributor-line">',
    renderTooltipInlineLabeledMetric(
      TOOLTIP_POST_ICON,
      datum.postCount,
      'posts'
    ),
    renderTooltipInlineLabeledMetric(
      TOOLTIP_UPVOTE_ICON,
      datum.postScore,
      'post upvotes'
    ),
    '</div>',
    '<div class="chart-tooltip__stats chart-tooltip__contributor-line">',
    renderTooltipInlineLabeledMetric(
      TOOLTIP_COMMENT_ICON,
      datum.commentCount,
      'comments'
    ),
    renderTooltipInlineLabeledMetric(
      TOOLTIP_UPVOTE_ICON,
      datum.commentScore,
      'comment upvotes'
    ),
    '</div>',
    '</article>',
  ].join('');
}

function renderTooltipAvatar(rawAvatarUrl: string | null): string {
  const avatarUrl = escapeHtml(resolveUserAvatarUrl(rawAvatarUrl));

  return `<img alt="" class="chart-tooltip__avatar" src="${avatarUrl}">`;
}

function renderCurrentUserTooltipBadge(isCurrentUser: boolean): string {
  return isCurrentUser ? '<span class="chart-tooltip__you">you</span>' : '';
}

function renderCommentTooltipTitle(datum: CommentBubbleDatum): string {
  return `<strong class="chart-tooltip__title">${renderCommentPreview(datum.bodyPreview)}</strong>`;
}

function renderCommentPreview(bodyPreview: string): string {
  return bodyPreview
    .split(
      new RegExp(
        `(${COMMENT_GIF_PREVIEW_MARKER}|${COMMENT_IMAGE_PREVIEW_MARKER})`,
        'gu'
      )
    )
    .map(renderCommentPreviewPart)
    .join('');
}

function renderCommentPreviewPart(part: string): string {
  if (part === COMMENT_GIF_PREVIEW_MARKER) {
    return renderMediaCommentTooltipLabel('GIF');
  }

  if (part === COMMENT_IMAGE_PREVIEW_MARKER) {
    return renderMediaCommentTooltipLabel('Image');
  }

  return escapeHtml(part);
}

function renderMediaCommentTooltipLabel(label: string): string {
  return `<span class="chart-tooltip__media-label">${escapeHtml(label)}</span>`;
}

function renderTooltipVotePill(value: number, label = 'upvotes'): string {
  const valueLabel = value.toLocaleString();

  return `<span class="chart-tooltip__metric chart-tooltip__metric--pill chart-tooltip__metric--vote" aria-label="${escapeHtml(`${valueLabel} ${label}`)}">${TOOLTIP_UPVOTE_ICON}<span class="chart-tooltip__metric-value">${valueLabel}</span>${TOOLTIP_DOWNVOTE_ICON}</span>`;
}

function renderTooltipCommentPill(value: number): string {
  const valueLabel = value.toLocaleString();

  return `<span class="chart-tooltip__metric chart-tooltip__metric--pill chart-tooltip__metric--comments" aria-label="${escapeHtml(`${valueLabel} comments`)}">${TOOLTIP_COMMENT_ICON}<span class="chart-tooltip__metric-value">${valueLabel}</span></span>`;
}

function renderTooltipInlineVoteMetric(
  value: number,
  label = 'upvotes'
): string {
  const valueLabel = value.toLocaleString();

  return `<span class="chart-tooltip__metric chart-tooltip__metric--inline-vote" aria-label="${escapeHtml(`${valueLabel} ${label}`)}">${TOOLTIP_UPVOTE_ICON}<span class="chart-tooltip__metric-value">${valueLabel}</span>${TOOLTIP_DOWNVOTE_ICON}</span>`;
}

function renderTooltipInlineLabeledMetric(
  icon: string,
  value: number,
  label: string
): string {
  const valueLabel = value.toLocaleString();

  return `<span class="chart-tooltip__metric chart-tooltip__metric--inline-labeled" aria-label="${escapeHtml(`${valueLabel} ${label}`)}">${icon}<span class="chart-tooltip__metric-value">${valueLabel}</span><span class="chart-tooltip__metric-label">${escapeHtml(label)}</span></span>`;
}
