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
  const label = enabled ? 'Hide my bubbles' : 'Show my bubbles';

  return (
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
      title={label}
      type="button"
    >
      <TrustedSvgIcon
        className="chart-my-bubbles-toggle__icon"
        svg={targetIcon}
      />
    </button>
  );
}
