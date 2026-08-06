/** Shared helpers for admin Zustand domain stores */
export function errMsg(e: unknown, fallback = 'Request failed') {
  return e instanceof Error ? e.message : fallback;
}

export type AsyncSlice = {
  loading: boolean;
  error: string | null;
};
