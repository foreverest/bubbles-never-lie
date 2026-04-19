import { getWebViewMode, requestExpandedMode } from '@devvit/web/client';
import { useEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import { App } from './app';

type WebViewMode = 'inline' | 'expanded';

export function ChartEntry() {
  const [webViewMode, setWebViewMode] = useState<WebViewMode>(readWebViewMode);

  useEffect(() => {
    const syncWebViewMode = () => setWebViewMode(readWebViewMode());

    window.addEventListener('focus', syncWebViewMode);
    document.addEventListener('visibilitychange', syncWebViewMode);

    return () => {
      window.removeEventListener('focus', syncWebViewMode);
      document.removeEventListener('visibilitychange', syncWebViewMode);
    };
  }, []);

  const handleRequestExpandedMode = (
    event: ReactMouseEvent<HTMLButtonElement>
  ) => {
    try {
      requestExpandedMode(event.nativeEvent, 'game');
    } catch (error) {
      console.warn('Unable to open expanded chart:', error);
    }
  };

  if (webViewMode === 'inline') {
    return <App onRequestExpandedMode={handleRequestExpandedMode} />;
  }

  return <App />;
}

function readWebViewMode(): WebViewMode {
  try {
    return getWebViewMode();
  } catch {
    return 'inline';
  }
}
