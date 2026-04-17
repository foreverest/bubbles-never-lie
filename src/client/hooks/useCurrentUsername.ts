import { context as clientContext } from '@devvit/web/client';

import { normalizeUsername } from '../charts/data';

export function useCurrentUsername(): string | null {
  return normalizeUsername(clientContext.username);
}
