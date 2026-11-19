import crypto from 'crypto';

const PRIMARY_EMPLOYEE_SECRET =
  process.env.TENANT_JWT_SECRET ||
  process.env.EMPLOYEE_JWT_SECRET ||
  'latisha-farma-tenant-auth-secret-key-2026';

const ACCEPTED_SECRETS = [
  PRIMARY_EMPLOYEE_SECRET,
  'latisha-farma-tenant-auth-secret-key-2026',
  'apoteksu-employee-auth-secret-key-2026',
];

export interface EmployeeTokenPayload {
  uid: string;
  employeeId: number;
  nip: string;
  name: string;
  email: string;
  jobTitle: string;
  role: string;
  exp: number;
}

export function signEmployeeToken(payload: Omit<EmployeeTokenPayload, 'exp'>): string {
  const fullPayload: EmployeeTokenPayload = {
    ...payload,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const data = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', PRIMARY_EMPLOYEE_SECRET)
    .update(data)
    .digest('base64url');
  return `lf_emp_${data}.${sig}`;
}

export function verifyEmployeeToken(token: string): EmployeeTokenPayload | null {
  if (!token.startsWith('lf_emp_')) return null;
  const raw = token.slice('lf_emp_'.length);
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;

  const isValidSig = ACCEPTED_SECRETS.some((secret) => {
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('base64url');
    return sig === expectedSig;
  });

  if (!isValidSig) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(data, 'base64url').toString('utf8')
    ) as EmployeeTokenPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
