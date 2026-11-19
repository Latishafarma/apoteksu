import { auth } from './firebase';
import { handleBrowserLocalApi } from './browserLocalApi';

const TENANT_SESSION_KEY = 'lf_tenant_session_v1';

export interface StoredTenantSession {
  token: string;
  user: {
    uid: string;
    email: string;
    name: string;
    role: 'super_admin' | 'tenant_admin' | 'apoteker' | string;
    nip?: string;
    jobTitle?: string;
    faskesName?: string;
    planTier?: string;
  };
}

export function getStoredTenantSession(): StoredTenantSession | null {
  try {
    const raw = sessionStorage.getItem(TENANT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTenantSession;
    if (!parsed?.token || !parsed?.user?.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setStoredTenantSession(session: StoredTenantSession | null) {
  try {
    if (!session) {
      sessionStorage.removeItem(TENANT_SESSION_KEY);
    } else {
      sessionStorage.setItem(TENANT_SESSION_KEY, JSON.stringify(session));
    }
  } catch {
    // ignore storage quota errors
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

function isStaticHostWithoutBackend(): boolean {
  if (API_BASE_URL) return false;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host.endsWith('.github.io') || host.endsWith('.pages.dev') || host.endsWith('.netlify.app');
}

let useStaticLocalApiFallback = isStaticHostWithoutBackend();

function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (API_BASE_URL) {
    return `${API_BASE_URL}${normalizedPath}`;
  }
  return normalizedPath;
}

function shouldFallbackToLocalApi(response: Response): boolean {
  if (response.status === 404 || response.status === 405 || response.status === 502 || response.status === 503) {
    return true;
  }
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (response.ok && contentType.includes('text/html')) {
    return true;
  }
  return false;
}

export async function publicApiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (useStaticLocalApiFallback) {
    return handleBrowserLocalApi<T>(path, options);
  }

  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(resolveApiUrl(path), {
      ...options,
      headers,
    });
  } catch {
    useStaticLocalApiFallback = true;
    return handleBrowserLocalApi<T>(path, options);
  }

  if (shouldFallbackToLocalApi(response)) {
    useStaticLocalApiFallback = true;
    return handleBrowserLocalApi<T>(path, options);
  }

  if (!response.ok) {
    let errorMsg = `Permintaan gagal (${response.status})`;
    try {
      const errBody = await response.json();
      if (errBody?.error) {
        errorMsg = errBody.error;
      }
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return (await response.json()) as T;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let token: string | null = null;
  const user = auth.currentUser;
  if (user) {
    token = await user.getIdToken();
  } else {
    const tenantSession = getStoredTenantSession();
    if (tenantSession?.token) {
      token = tenantSession.token;
    }
  }

  if (!token) {
    throw new Error('Sesi autentikasi berakhir. Silakan masuk kembali.');
  }

  if (useStaticLocalApiFallback) {
    return handleBrowserLocalApi<T>(path, options);
  }

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(resolveApiUrl(path), {
      ...options,
      headers,
    });
  } catch {
    useStaticLocalApiFallback = true;
    return handleBrowserLocalApi<T>(path, options);
  }

  if (shouldFallbackToLocalApi(response)) {
    useStaticLocalApiFallback = true;
    return handleBrowserLocalApi<T>(path, options);
  }

  if (!response.ok) {
    let errorMsg = `Permintaan gagal (${response.status})`;
    try {
      const errBody = await response.json();
      if (errBody?.error) {
        errorMsg = errBody.error;
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errorMsg);
  }

  return (await response.json()) as T;
}
