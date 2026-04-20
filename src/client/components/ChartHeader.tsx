import { Fragment, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import type { ChartResponseMetadata } from '../../shared/api';
import chevronIcon from '../assets/icons/chevron.svg?raw';
import settingsIcon from '../assets/icons/settings.svg?raw';
import type { TabName, ThemeMode } from '../types';
import { TABS, getTabLabel } from '../types';
import { formatDateRangeLabels } from '../utils/date';
import { TrustedSvgIcon } from './TrustedSvgIcon';

type OpenMenu = 'sections' | 'settings' | 'mobile' | null;

type ChartHeaderProps = {
  data: ChartResponseMetadata;
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => void;
  onFeedbackOpen: () => void;
  onRequestExpandedMode?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
};

const THEME_OPTIONS: readonly { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
];

export function ChartHeader({
  data,
  activeTab,
  onTabChange,
  themeMode,
  onThemeModeChange,
  onFeedbackOpen,
  onRequestExpandedMode,
}: ChartHeaderProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const sectionMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const mobileControlsRef = useRef<HTMLDivElement | null>(null);
  const activeTabLabel = getTabLabel(activeTab);
  const dateRangeLabel = formatDateRangeLabels(data.dateRange);
  const activePanelId =
    TABS.find((tab) => tab.name === activeTab)?.panelId ?? `${activeTab}-panel`;

  useEffect(() => {
    if (!openMenu) {
      return;
    }

    const handleDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target;
      const activeMenuRef =
        openMenu === 'sections'
          ? sectionMenuRef
          : openMenu === 'settings'
            ? settingsRef
            : mobileControlsRef;

      if (target instanceof Node && !activeMenuRef.current?.contains(target)) {
        setOpenMenu(null);
      }
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
      }
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown);
    document.addEventListener('keydown', handleDocumentKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [openMenu]);

  const handleSectionSelect = (tab: TabName) => {
    onTabChange(tab);
    setOpenMenu(null);
  };

  const handleRequestExpandedMode = (
    event: ReactMouseEvent<HTMLButtonElement>
  ) => {
    onRequestExpandedMode?.(event);
    setOpenMenu(null);
  };

  const handleFeedbackOpen = () => {
    onFeedbackOpen();
    setOpenMenu(null);
  };

  return (
    <header className="chart-header">
      <div className="chart-header__main">
        <div
          className={
            data.subredditIconUrl
              ? 'chart-title chart-title--with-icon'
              : 'chart-title'
          }
        >
          <div className="chart-title__name">
            {data.subredditIconUrl ? (
              <img
                alt=""
                className="chart-title__icon"
                src={data.subredditIconUrl}
              />
            ) : null}
            <span>r/{data.subredditName}</span>
          </div>
          <p
            aria-label={dateRangeLabel.fullLabel}
            className="chart-title__meta"
            title={dateRangeLabel.fullLabel}
          >
            <span className="chart-title__meta-desktop">
              {dateRangeLabel.compactLabel}
            </span>
            <span className="chart-title__meta-mobile">
              {dateRangeLabel.compactLabel}
            </span>
          </p>
        </div>
      </div>

      <div className="chart-controls chart-controls--desktop">
        <div className="chart-section-menu" ref={sectionMenuRef}>
          <button
            aria-controls={activePanelId}
            aria-expanded={openMenu === 'sections'}
            aria-haspopup="true"
            aria-label="Bubbles Never Lie section"
            className={
              openMenu === 'sections'
                ? 'section-menu-button section-menu-button--open'
                : 'section-menu-button'
            }
            onClick={() =>
              setOpenMenu((menu) => (menu === 'sections' ? null : 'sections'))
            }
            type="button"
          >
            <span>{activeTabLabel}</span>
            <ChevronIcon className="section-menu-button__icon" />
          </button>

          {openMenu === 'sections' ? (
            <div
              className="chart-section-menu__menu"
              aria-label="Bubbles Never Lie sections"
              role="menu"
            >
              <TabItems
                activeTab={activeTab}
                onTabSelect={handleSectionSelect}
              />
            </div>
          ) : null}
        </div>

        <div className="chart-settings" ref={settingsRef}>
          <button
            aria-expanded={openMenu === 'settings'}
            aria-haspopup="true"
            aria-label="Chart settings"
            className={
              openMenu === 'settings'
                ? 'chart-menu-button chart-menu-button--open'
                : 'chart-menu-button'
            }
            onClick={() =>
              setOpenMenu((menu) => (menu === 'settings' ? null : 'settings'))
            }
            type="button"
          >
            <SettingsIcon />
          </button>

          {openMenu === 'settings' ? (
            <div
              className="chart-settings__menu"
              aria-label="Chart settings"
              role="group"
            >
              <SettingsMenuContent
                themeMode={themeMode}
                onThemeModeChange={onThemeModeChange}
                onFeedbackOpen={handleFeedbackOpen}
                {...(onRequestExpandedMode
                  ? { onRequestExpandedMode: handleRequestExpandedMode }
                  : {})}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="chart-mobile-controls" ref={mobileControlsRef}>
        <button
          aria-expanded={openMenu === 'mobile'}
          aria-haspopup="true"
          aria-label="Chart navigation and settings"
          className={
            openMenu === 'mobile'
              ? 'chart-mobile-controls__button chart-mobile-controls__button--open'
              : 'chart-mobile-controls__button'
          }
          onClick={() =>
            setOpenMenu((menu) => (menu === 'mobile' ? null : 'mobile'))
          }
          type="button"
        >
          <span>{activeTabLabel}</span>
          <ChevronIcon className="chart-mobile-controls__icon" />
        </button>

        {openMenu === 'mobile' ? (
          <div className="chart-mobile-controls__menu">
            <div
              className="chart-mobile-controls__group"
              aria-label="Bubbles Never Lie sections"
              role="menu"
            >
              <TabItems
                activeTab={activeTab}
                onTabSelect={handleSectionSelect}
              />
            </div>

            <div
              className="chart-mobile-controls__group"
              aria-label="Chart settings"
              role="group"
            >
              <SettingsMenuContent
                themeMode={themeMode}
                onThemeModeChange={onThemeModeChange}
                onFeedbackOpen={handleFeedbackOpen}
                {...(onRequestExpandedMode
                  ? { onRequestExpandedMode: handleRequestExpandedMode }
                  : {})}
              />
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function SettingsMenuContent({
  themeMode,
  onThemeModeChange,
  onFeedbackOpen,
  onRequestExpandedMode,
}: {
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => void;
  onFeedbackOpen: () => void;
  onRequestExpandedMode?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <>
      {onRequestExpandedMode ? (
        <>
          <button
            className="chart-settings__action"
            onClick={onRequestExpandedMode}
            type="button"
          >
            Expand
          </button>
          <div className="chart-settings__divider" />
        </>
      ) : null}
      <div className="chart-theme-control" aria-label="Theme">
        <span className="chart-theme-control__label">Theme</span>
        <div className="chart-theme-control__options">
          {THEME_OPTIONS.map((option) => (
            <button
              aria-pressed={themeMode === option.mode}
              className={
                themeMode === option.mode
                  ? 'chart-theme-control__option chart-theme-control__option--active'
                  : 'chart-theme-control__option'
              }
              key={option.mode}
              onClick={() => onThemeModeChange(option.mode)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-settings__divider" />
      <button
        className="chart-settings__action"
        onClick={onFeedbackOpen}
        type="button"
      >
        Feedback
      </button>
    </>
  );
}

function TabItems({
  activeTab,
  onTabSelect,
}: {
  activeTab: TabName;
  onTabSelect: (tab: TabName) => void;
}) {
  return (
    <>
      {TABS.map((tab) => (
        <Fragment key={tab.name}>
          {tab.name === 'insights' ? (
            <div className="chart-section-menu__separator" role="separator" />
          ) : null}
          <button
            aria-checked={activeTab === tab.name}
            className={
              activeTab === tab.name
                ? 'chart-section-menu__item chart-section-menu__item--active'
                : 'chart-section-menu__item'
            }
            onClick={() => onTabSelect(tab.name)}
            role="menuitemradio"
            type="button"
          >
            {tab.label}
          </button>
        </Fragment>
      ))}
    </>
  );
}

function ChevronIcon({ className }: { className: string }) {
  return <TrustedSvgIcon className={className} svg={chevronIcon} />;
}

function SettingsIcon() {
  return (
    <TrustedSvgIcon className="chart-menu-button__icon" svg={settingsIcon} />
  );
}
