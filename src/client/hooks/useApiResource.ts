import { useEffect, useRef, useState } from 'react';

import { fetchApiData } from '../api/client';
import type { DataState } from '../types';

type UseApiResourceOptions = {
  path: string;
  fallbackMessage: string;
  errorLogLabel: string;
  enabled?: boolean;
};

export function useApiResource<Data>({
  path,
  fallbackMessage,
  errorLogLabel,
  enabled = true,
}: UseApiResourceOptions): DataState<Data> {
  const [shouldLoad, setShouldLoad] = useState(enabled);
  const [state, setState] = useState<DataState<Data>>(() =>
    enabled ? { status: 'loading' } : { status: 'idle' }
  );
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (enabled) {
      setShouldLoad(true);
    }
  }, [enabled]);

  useEffect(() => {
    if (!shouldLoad || hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;
    setState({ status: 'loading' });

    const controller = new AbortController();

    async function loadData() {
      try {
        const data = await fetchApiData<Data>(
          path,
          fallbackMessage,
          controller.signal
        );
        setState({ status: 'ready', data });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        console.error(errorLogLabel, error);
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : fallbackMessage,
        });
      }
    }

    void loadData();

    return () => {
      controller.abort();
    };
  }, [errorLogLabel, fallbackMessage, path, shouldLoad]);

  return state;
}
