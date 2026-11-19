import type { ExternalLicenseState } from '../types/pharmacy.ts';

let cachedLicenseState: ExternalLicenseState | null = null;
let lastCheckedTimestamp = 0;
const CACHE_TTL_MS = 60_000;

export function getExternalLicenseConfig() {
  let rawPortalUrl = (process.env.LICENSE_PORTAL_API_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const apiKey = (process.env.LICENSE_PORTAL_API_KEY || '').trim();
  const clientEmail = (process.env.LICENSE_CLIENT_EMAIL || '').trim();
  const registrationNumber = (process.env.LICENSE_REGISTRATION_NUMBER || '').trim();
  const appCode = (process.env.LICENSE_APP_CODE || 'APOTEKSU').trim().toUpperCase();

  // Auto-prepend http:// or https:// if user provided a hostname/domain without protocol
  if (rawPortalUrl && !/^https?:\/\//i.test(rawPortalUrl)) {
    if (
      rawPortalUrl.startsWith('localhost') ||
      rawPortalUrl.startsWith('127.0.0.1')
    ) {
      rawPortalUrl = `http://${rawPortalUrl}`;
    } else if (rawPortalUrl.includes('.')) {
      rawPortalUrl = `https://${rawPortalUrl}`;
    }
  }

  let validPortalUrl: string | null = null;
  if (rawPortalUrl && /^https?:\/\//i.test(rawPortalUrl) && !rawPortalUrl.includes('MY_')) {
    try {
      const parsed = new URL(rawPortalUrl);
      validPortalUrl = parsed.origin + parsed.pathname.replace(/\/+$/, '');
    } catch {
      validPortalUrl = null;
    }
  }

  const isConfigured = Boolean(
    validPortalUrl && apiKey && (clientEmail || registrationNumber)
  );

  return {
    isConfigured,
    portalUrl: validPortalUrl,
    apiKey,
    clientEmail: clientEmail || null,
    registrationNumber: registrationNumber || null,
    appCode,
  };
}

export async function verifyExternalClientLicense(options?: {
  forceRefresh?: boolean;
}): Promise<ExternalLicenseState> {
  const config = getExternalLicenseConfig();
  const nowIso = new Date().toISOString();

  if (!config.isConfigured || !config.portalUrl) {
    return {
      configured: false,
      reachable: false,
      allowed: true,
      accessLevel: 'full',
      status: 'Aktif (Mode Operasional Mandiri)',
      reasonCode: 'STANDALONE_MODE',
      message:
        'ApotekSu berjalan dalam mode operasional mandiri. Isi LICENSE_PORTAL_API_URL, LICENSE_PORTAL_API_KEY, dan LICENSE_CLIENT_EMAIL untuk menyinkronkan status langganan ke Portal Lisensi eksternal.',
      appCode: config.appCode,
      portalUrl: config.portalUrl,
      clientEmail: config.clientEmail,
      client: null,
      checkedAt: nowIso,
    };
  }

  if (
    !options?.forceRefresh &&
    cachedLicenseState &&
    Date.now() - lastCheckedTimestamp < CACHE_TTL_MS
  ) {
    return cachedLicenseState;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    let response = await fetch(`${config.portalUrl}/api/v1/license/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-License-Api-Key': config.apiKey,
      },
      body: JSON.stringify({
        appCode: config.appCode,
        ...(config.clientEmail ? { email: config.clientEmail } : {}),
        ...(config.registrationNumber
          ? { registrationNumber: config.registrationNumber }
          : {}),
        source: 'ApotekSu Operational App',
      }),
      signal: controller.signal,
    });

    if (response.status === 404 || response.status === 405) {
      const params = new URLSearchParams({ appCode: config.appCode });
      if (config.clientEmail) params.set('email', config.clientEmail);
      if (config.registrationNumber) {
        params.set('registrationNumber', config.registrationNumber);
      }
      const statusRes = await fetch(
        `${config.portalUrl}/api/v1/license/status?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'X-License-Api-Key': config.apiKey,
          },
          signal: controller.signal,
        }
      );
      if (statusRes.ok || statusRes.status === 403) {
        response = statusRes;
      }
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const rawClient = (payload.client as Record<string, unknown> | null) || null;
    const allowed = typeof payload.allowed === 'boolean' ? payload.allowed : response.ok;
    const accessLevelRaw = String(payload.accessLevel || '');
    const accessLevel: 'full' | 'grace_warning' | 'blocked' =
      accessLevelRaw === 'grace_warning'
        ? 'grace_warning'
        : allowed
          ? 'full'
          : 'blocked';

    const resolvedStatus = rawClient?.status
      ? String(rawClient.status)
      : accessLevel === 'grace_warning'
        ? 'Masa Tenggang'
        : allowed
          ? 'Aktif'
          : 'Nonaktif/Suspend';

    const state: ExternalLicenseState = {
      configured: true,
      reachable: true,
      allowed,
      accessLevel,
      status: resolvedStatus,
      reasonCode: String(payload.reasonCode || (allowed ? 'ACTIVE' : 'BLOCKED')),
      message: String(
        payload.message ||
          payload.error ||
          (allowed
            ? 'Lisensi aplikasi ApotekSu aktif dan terverifikasi.'
            : 'Akses lisensi klien tidak diizinkan oleh Portal Lisensi.')
      ),
      appCode: config.appCode,
      portalUrl: config.portalUrl,
      clientEmail: config.clientEmail,
      client: rawClient
        ? {
            faskesName: String(rawClient.faskesName || ''),
            planTier: String(rawClient.planTier || 'Pro Clinical'),
            billingCycle: String(rawClient.billingCycle || 'Bulanan'),
            status: String(rawClient.status || resolvedStatus),
            dueDate: rawClient.dueDate ? String(rawClient.dueDate) : null,
            daysRemaining:
              typeof rawClient.daysRemaining === 'number' ? rawClient.daysRemaining : null,
          }
        : null,
      checkedAt: String(payload.checkedAt || nowIso),
    };

    cachedLicenseState = state;
    lastCheckedTimestamp = Date.now();
    return state;
  } catch (error: unknown) {
    const errMsg =
      error instanceof Error ? error.message : 'Gagal menghubungi server Portal Lisensi.';
    const fallbackState: ExternalLicenseState = {
      configured: true,
      reachable: false,
      allowed: true,
      accessLevel: 'full',
      status: 'Offline Fallback (Operasional Tetap Aktif)',
      reasonCode: 'PORTAL_UNREACHABLE',
      message: `Portal Lisensi (${config.portalUrl}) belum merespons (${errMsg}). Operasional harian apotek tetap dapat berjalan.`,
      appCode: config.appCode,
      portalUrl: config.portalUrl,
      clientEmail: config.clientEmail,
      client: null,
      checkedAt: nowIso,
    };
    return fallbackState;
  } finally {
    clearTimeout(timer);
  }
}
