import targetIcon from '../assets/icons/target.svg?raw';
import { TrustedSvgIcon } from './TrustedSvgIcon';

type ChartMyBubblesToggleProps = {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
};

export function ChartMyBubblesToggle({
  enabled,
  onEnabledChange,
}: ChartMyBubblesToggleProps) {
  const label = enabled ? 'Remove highlight' : 'Highlight my bubbles';

  return (
    <span className="chart-my-bubbles-toggle-shell">
      <button
        aria-checked={enabled}
        aria-label={label}
        className={
          enabled
            ? 'chart-my-bubbles-toggle chart-my-bubbles-toggle--enabled'
            : 'chart-my-bubbles-toggle'
        }
        onClick={() => onEnabledChange(!enabled)}
        role="switch"
        type="button"
      >
        <TrustedSvgIcon
          className="chart-my-bubbles-toggle__icon"
          svg={targetIcon}
        />
      </button>
      <span
        aria-hidden="true"
        className="chart-my-bubbles-toggle__tooltip"
        role="tooltip"
      >
        {label}
      </span>
    </span>
  );
}
