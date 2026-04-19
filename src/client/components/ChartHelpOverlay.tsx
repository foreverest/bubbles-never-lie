import { useEffect, useId, useRef, useState } from 'react';
import type {
  FocusEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';

import chartHelpSizeIcon from '../assets/icons/chart-help-size.svg?raw';
import chartHelpXAxisIcon from '../assets/icons/chart-help-x-axis.svg?raw';
import chartHelpYAxisIcon from '../assets/icons/chart-help-y-axis.svg?raw';
import type { ChartHelpDetails, ChartHelpItemKind } from '../charts/help';
import { TrustedSvgIcon } from './TrustedSvgIcon';

export function ChartHelpOverlay({ details }: { details: ChartHelpDetails }) {
  const tooltipId = useId();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const isOpen = hoverOpen || focusOpen || pinnedOpen;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const close = () => {
      setHoverOpen(false);
      setFocusOpen(false);
      setPinnedOpen(false);
    };

    const handleDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!target || overlayRef.current?.contains(target)) {
        return;
      }

      close();
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown);
    document.addEventListener('keydown', handleDocumentKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [isOpen]);

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextFocusTarget = event.relatedTarget;
    if (
      nextFocusTarget instanceof Node &&
      event.currentTarget.contains(nextFocusTarget)
    ) {
      return;
    }

    setFocusOpen(false);
  };

  const handleButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (pinnedOpen) {
      setHoverOpen(false);
      setFocusOpen(false);
      setPinnedOpen(false);
      return;
    }

    setPinnedOpen(true);
  };

  const stopChartEvent = (
    event: MouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement>
  ) => {
    event.stopPropagation();
  };

  return (
    <div
      className="chart-help"
      ref={overlayRef}
      onBlur={handleBlur}
      onClick={stopChartEvent}
      onDoubleClick={stopChartEvent}
      onFocus={() => setFocusOpen(true)}
      onMouseEnter={() => setHoverOpen(true)}
      onMouseLeave={() => setHoverOpen(false)}
      onPointerDown={stopChartEvent}
      onPointerMove={stopChartEvent}
      onPointerUp={stopChartEvent}
    >
      <button
        type="button"
        className={
          isOpen
            ? 'chart-help__button chart-help__button--open'
            : 'chart-help__button'
        }
        aria-controls={tooltipId}
        aria-expanded={isOpen}
        aria-label="Explain this chart"
        onClick={handleButtonClick}
      >
        ?
      </button>

      {isOpen ? (
        <div className="chart-help__tooltip" id={tooltipId} role="tooltip">
          <div className="chart-help__items">
            {details.items.map((item) => (
              <div className="chart-help__item" key={item.kind}>
                {renderChartHelpIcon(item.kind)}
                <span className="chart-help__item-copy">
                  <span className="chart-help__item-label">{item.label}</span>
                  <span className="chart-help__item-description">
                    {item.description}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function renderChartHelpIcon(kind: ChartHelpItemKind): ReactNode {
  if (kind === 'color') {
    return <span className="chart-help__gradient-bubble" aria-hidden="true" />;
  }

  if (kind === 'size') {
    return (
      <TrustedSvgIcon className="chart-help__icon" svg={chartHelpSizeIcon} />
    );
  }

  if (kind === 'y-axis') {
    return (
      <TrustedSvgIcon className="chart-help__icon" svg={chartHelpYAxisIcon} />
    );
  }

  return (
    <TrustedSvgIcon className="chart-help__icon" svg={chartHelpXAxisIcon} />
  );
}
