import { useEffect } from 'react';

import { USER_AVATAR_FALLBACK_URL } from '../../shared/api';

export function useTooltipAvatarFallback(): void {
  useEffect(() => {
    const handleAvatarLoadError = (event: Event) => {
      const target = event.target;

      if (
        !(target instanceof HTMLImageElement) ||
        !target.classList.contains('chart-tooltip__avatar') ||
        target.src === USER_AVATAR_FALLBACK_URL
      ) {
        return;
      }

      target.src = USER_AVATAR_FALLBACK_URL;
    };

    document.addEventListener('error', handleAvatarLoadError, true);

    return () => {
      document.removeEventListener('error', handleAvatarLoadError, true);
    };
  }, []);
}
