import type { DateRange } from '../../shared/api';
import { formatDateRangePhrase } from '../utils/date';

export function EmptyState({
  contentLabel,
  subredditName,
  dateRange,
}: {
  contentLabel: string;
  subredditName: string;
  dateRange: DateRange;
}) {
  const datePhrase = formatDateRangePhrase(dateRange);

  return (
    <div className="empty-state">
      <p>{`No ${contentLabel} found ${datePhrase}.`}</p>
      <span>{`Try choosing dates when r/${subredditName} had activity.`}</span>
    </div>
  );
}
