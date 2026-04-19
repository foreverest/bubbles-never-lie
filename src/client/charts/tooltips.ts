import {
  COMMENT_GIF_PREVIEW_MARKER,
  COMMENT_IMAGE_PREVIEW_MARKER,
  resolveUserAvatarUrl,
} from '../../shared/api';
import { formatRelativeAge } from '../utils/date';
import { escapeHtml } from '../utils/html';
import type {
  CommentBubbleDatum,
  ContributorBubbleDatum,
  PostBubbleDatum,
} from './types';

type TooltipVariant = 'light' | 'dark';

const TOOLTIP_UPVOTE_ICON =
  '<svg aria-hidden="true" class="chart-tooltip__metric-icon" fill="currentColor" height="16" viewBox="0 0 20 20" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M10 19a3.966 3.966 0 01-3.96-3.962V10.98H2.838a1.731 1.731 0 01-1.605-1.073 1.734 1.734 0 01.377-1.895L9.364.254a.925.925 0 011.272 0l7.754 7.759c.498.499.646 1.242.376 1.894-.27.652-.9 1.073-1.605 1.073h-3.202v4.058A3.965 3.965 0 019.999 19H10zM2.989 9.179H7.84v5.731c0 1.13.81 2.163 1.934 2.278a2.163 2.163 0 002.386-2.15V9.179h4.851L10 2.163 2.989 9.179z"></path></svg>';
const TOOLTIP_DOWNVOTE_ICON =
  '<svg aria-hidden="true" class="chart-tooltip__metric-icon" fill="currentColor" height="16" viewBox="0 0 20 20" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M10 1a3.966 3.966 0 013.96 3.962V9.02h3.202c.706 0 1.335.42 1.605 1.073.27.652.122 1.396-.377 1.895l-7.754 7.759a.925.925 0 01-1.272 0l-7.754-7.76a1.734 1.734 0 01-.376-1.894c.27-.652.9-1.073 1.605-1.073h3.202V4.962A3.965 3.965 0 0110 1zm7.01 9.82h-4.85V5.09c0-1.13-.81-2.163-1.934-2.278a2.163 2.163 0 00-2.386 2.15v5.859H2.989l7.01 7.016 7.012-7.016z"></path></svg>';
const TOOLTIP_COMMENT_ICON =
  '<svg aria-hidden="true" class="chart-tooltip__metric-icon" fill="currentColor" height="16" viewBox="0 0 20 20" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M10 1a9 9 0 00-9 9c0 1.947.79 3.58 1.935 4.957L.231 17.661A.784.784 0 00.785 19H10a9 9 0 009-9 9 9 0 00-9-9zm0 16.2H6.162c-.994.004-1.907.053-3.045.144l-.076-.188a36.981 36.981 0 002.328-2.087l-1.05-1.263C3.297 12.576 2.8 11.331 2.8 10c0-3.97 3.23-7.2 7.2-7.2s7.2 3.23 7.2 7.2-3.23 7.2-7.2 7.2z"></path></svg>';
const TOOLTIP_POST_ICON =
  '<svg aria-hidden="true" class="chart-tooltip__metric-icon" fill="currentColor" height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg"><path d="M14.7 2H5.3C3.48 2 2 3.48 2 5.3v9.4C2 16.52 3.48 18 5.3 18h9.4c1.82 0 3.3-1.48 3.3-3.3V5.3C18 3.48 16.52 2 14.7 2zm1.5 12.7c0 .83-.67 1.5-1.5 1.5H5.3c-.83 0-1.5-.67-1.5-1.5V5.3c0-.83.67-1.5 1.5-1.5h9.4c.83 0 1.5.67 1.5 1.5v9.4z"></path><path d="M12 11.1H6v1.8h6v-1.8zM14 7.1H6v1.8h8V7.1z"></path></svg>';

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
