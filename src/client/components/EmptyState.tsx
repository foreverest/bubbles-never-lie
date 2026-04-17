import type { TimeframePostData } from '../../shared/api';
import { formatTimeframeDatePhrase } from '../utils/date';

export function EmptyState({
  contentLabel,
  subredditName,
  timeframe,
}: {
  contentLabel: string;
  subredditName: string;
  timeframe: TimeframePostData;
}) {
  const datePhrase = formatTimeframeDatePhrase(timeframe);

  return (
    <div className="empty-state">
      <p>{`No ${contentLabel} found ${datePhrase}.`}</p>
      <span>{`Try choosing dates when r/${subredditName} had activity.`}</span>
    </div>
  );
}
