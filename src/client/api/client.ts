import type { ErrorResponse } from '../../shared/api';

export async function fetchApiData<Data>(
  path: string,
  fallbackMessage: string,
  signal?: AbortSignal
): Promise<Data> {
  const response = await fetch(path, signal ? { signal } : undefined);
  const body = (await response.json()) as Data | ErrorResponse;

  if (!response.ok || isErrorResponse(body)) {
    console.error(`Error response from ${path}:`, body);
    throw new Error(isErrorResponse(body) ? body.message : fallbackMessage);
  }

  return body;
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const body = value as Partial<Record<keyof ErrorResponse, unknown>>;
  return body.status === 'error' && typeof body.message === 'string';
}
