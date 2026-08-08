/** Shared helpers for admin Zustand domain stores */
import { showToast } from '../components/Toast';

export function errMsg(e: unknown, fallback = 'Request failed') {
  return e instanceof Error ? e.message : fallback;
}

export type AsyncSlice = {
  loading: boolean;
  error: string | null;
};

/** Run a mutation, toast success/error, and rethrow on failure so callers can handle UI state. */
export async function notifyAction<T>(
  action: () => Promise<T>,
  successMessage: string,
  errorFallback = 'Action failed',
): Promise<T> {
  try {
    const result = await action();
    showToast(successMessage, 'success');
    return result;
  } catch (e) {
    showToast(errMsg(e, errorFallback), 'error');
    throw e;
  }
}
