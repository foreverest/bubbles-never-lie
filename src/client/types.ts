export type DataState<Data> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: Data }
  | { status: 'error'; message: string };

export type TabName = 'posts' | 'comments' | 'contributors' | 'stats';

export type TabDefinition = {
  name: TabName;
  label: string;
  panelId: string;
};

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = Exclude<ThemeMode, 'system'>;

export type ChartPreferences = {
  zoomEnabled: boolean;
  currentUserRippleEnabled: boolean;
  themeMode: ThemeMode;
};

export const TABS: readonly TabDefinition[] = [
  { name: 'posts', label: 'Posts', panelId: 'posts-panel' },
  { name: 'comments', label: 'Comments', panelId: 'comments-panel' },
  { name: 'contributors', label: 'Contributors', panelId: 'contributors-panel' },
  { name: 'stats', label: 'Stats', panelId: 'stats-panel' },
];

export function getTabLabel(tab: TabName): string {
  return TABS.find((definition) => definition.name === tab)?.label ?? tab;
}
