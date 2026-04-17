import { navigateTo } from '@devvit/web/client';

export function openRedditUrl(permalink: string): void {
  const url = new URL(permalink, 'https://www.reddit.com');
  navigateTo(url.toString());
}
