import { useEffect, useRef, useState } from 'react';

import type { ChartResponseMetadata } from '../../shared/api';
import type { ChartPreferences, TabName, ThemeMode } from '../types';
import { TABS, getTabLabel } from '../types';
import { formatTimeframeDateRangeLabels } from '../utils/date';

type OpenMenu = 'sections' | 'settings' | 'mobile' | null;

type ChartHeaderProps = {
  data: ChartResponseMetadata;
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  zoomEnabled: boolean;
  onZoomEnabledChange: (enabled: boolean) => void;
  currentUserRippleEnabled: boolean;
  onCurrentUserRippleEnabledChange: (enabled: boolean) => void;
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => void;
};

type ChartSetting = {
  key: Exclude<keyof ChartPreferences, 'themeMode'>;
  label: string;
  enabled: boolean;
  onToggle: () => void;
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
  zoomEnabled,
  onZoomEnabledChange,
  currentUserRippleEnabled,
  onCurrentUserRippleEnabledChange,
  themeMode,
  onThemeModeChange,
}: ChartHeaderProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const sectionMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const mobileControlsRef = useRef<HTMLDivElement | null>(null);
  const activeTabLabel = getTabLabel(activeTab);
  const timeframeLabel = formatTimeframeDateRangeLabels(data.timeframe);
  const activePanelId =
    TABS.find((tab) => tab.name === activeTab)?.panelId ?? `${activeTab}-panel`;
  const settings: ChartSetting[] = [
    {
      key: 'zoomEnabled',
      label: 'Zoom',
      enabled: zoomEnabled,
      onToggle: () => onZoomEnabledChange(!zoomEnabled),
    },
    {
      key: 'currentUserRippleEnabled',
      label: 'My bubbles',
      enabled: currentUserRippleEnabled,
      onToggle: () =>
        onCurrentUserRippleEnabledChange(!currentUserRippleEnabled),
    },
  ];

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
            aria-label={timeframeLabel.fullLabel}
            className="chart-title__meta"
            title={timeframeLabel.fullLabel}
          >
            <span className="chart-title__meta-desktop">
              {timeframeLabel.compactLabel}
            </span>
            <span className="chart-title__meta-mobile">
              {timeframeLabel.compactLabel}
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
                settings={settings}
                themeMode={themeMode}
                onThemeModeChange={onThemeModeChange}
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
                settings={settings}
                themeMode={themeMode}
                onThemeModeChange={onThemeModeChange}
              />
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function SettingsMenuContent({
  settings,
  themeMode,
  onThemeModeChange,
}: {
  settings: ChartSetting[];
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => void;
}) {
  return (
    <>
      <SettingsSwitches settings={settings} />
      <div className="chart-settings__divider" />
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
        <button
          aria-checked={activeTab === tab.name}
          className={
            activeTab === tab.name
              ? 'chart-section-menu__item chart-section-menu__item--active'
              : 'chart-section-menu__item'
          }
          key={tab.name}
          onClick={() => onTabSelect(tab.name)}
          role="menuitemradio"
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </>
  );
}

function SettingsSwitches({ settings }: { settings: ChartSetting[] }) {
  return (
    <>
      {settings.map((setting) => (
        <button
          aria-checked={setting.enabled}
          className={
            setting.enabled
              ? 'chart-settings__switch chart-settings__switch--on'
              : 'chart-settings__switch'
          }
          key={setting.key}
          onClick={setting.onToggle}
          role="switch"
          type="button"
        >
          <span>{setting.label}</span>
          <span className="chart-settings__switch-track" aria-hidden="true">
            <span className="chart-settings__switch-thumb" />
          </span>
        </button>
      ))}
    </>
  );
}

function ChevronIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 12 12">
      <path
        d="M3 4.5 6 7.5l3-3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      aria-hidden="true"
      className="chart-menu-button__icon"
      viewBox="0 0 20 20"
    >
      <path
        d="M8.9 2.5h2.2l.4 2.1c.4.1.8.3 1.1.5l1.8-1.2L16 5.5l-1.2 1.8c.2.4.4.7.5 1.1l2.1.4v2.3l-2.1.4c-.1.4-.3.8-.5 1.1l1.2 1.8-1.6 1.6-1.8-1.2c-.4.2-.7.4-1.1.5l-.4 2.1H8.9l-.4-2.1c-.4-.1-.8-.3-1.1-.5l-1.8 1.2L4 14.5l1.2-1.8c-.2-.4-.4-.7-.5-1.1l-2.1-.4V8.9l2.1-.4c.1-.4.3-.8.5-1.1L4 5.5l1.6-1.6 1.8 1.2c.4-.2.7-.4 1.1-.5l.4-2.1Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <circle
        cx="10"
        cy="10"
        fill="none"
        r="2.7"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}
