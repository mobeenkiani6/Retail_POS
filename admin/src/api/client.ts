const API_BASE = (import.meta.env.VITE_API_URL as string) || '/api';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message || (body as { message?: string })?.message || `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: Record<string, unknown> | string | null;
  skipAuth?: boolean;
};

function getToken() {
  return localStorage.getItem('admin_auth_token');
}

export async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const token = options.skipAuth ? null : getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.body != null && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  } else if (typeof options.body === 'string') {
    body = options.body;
  }

  const { body: _b, skipAuth: _s, ...rest } = options;
  const res = await fetch(url, { ...rest, headers, body });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text };
  }

  if (!res.ok) {
    if (res.status === 401 && token) {
      localStorage.removeItem('admin_auth_token');
      localStorage.removeItem('admin_user');
      window.location.href = '/login';
    }
    const bodyMsg =
      typeof json === 'object' && json && 'message' in json
        ? String((json as { message?: string }).message || '')
        : '';
    const clean =
      bodyMsg.includes('URL was not found') || res.status === 404
        ? 'API route not found. Restart the backend with start-backend.ps1, then refresh.'
        : bodyMsg || `Request failed (${res.status})`;
    throw new ApiError(res.status, json, clean);
  }
  return json as T;
}

export const get = <T = unknown>(path: string) => request<T>(path, { method: 'GET' });
export const post = <T = unknown>(path: string, body?: Record<string, unknown>) =>
  request<T>(path, { method: 'POST', body });
export const put = <T = unknown>(path: string, body?: Record<string, unknown>) =>
  request<T>(path, { method: 'PUT', body });
export const patch = <T = unknown>(path: string, body?: Record<string, unknown>) =>
  request<T>(path, { method: 'PATCH', body });
export const del = <T = unknown>(path: string) => request<T>(path, { method: 'DELETE' });

export { getToken, API_BASE };
