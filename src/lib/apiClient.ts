import { auth } from './firebase';

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

export async function publicApiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

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

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

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
