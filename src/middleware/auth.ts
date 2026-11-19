import type { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser } from '../db/users.ts';
import { verifyEmployeeToken } from '../lib/employeeAuth.ts';
import { getEmployeeById, resolveEmployeeAppRole } from '../db/repository.ts';

export interface AuthUserContext {
  uid: string;
  email: string;
  name: string;
  role: string;
  nip?: string;
  jobTitle?: string;
}

export interface AuthRequest extends Request {
  user?: AuthUserContext;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Token autentikasi tidak ditemukan.' });
  }

  const token = authHeader.split('Bearer ')[1];

  if (token.startsWith('lf_emp_')) {
    const payload = verifyEmployeeToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Sesi karyawan tidak valid atau kedaluwarsa.' });
    }
    try {
      const employee = await getEmployeeById(payload.employeeId);
      if (employee) {
        if ((employee.status || '').trim().toLowerCase().includes('nonaktif')) {
          return res.status(403).json({
            error: `Akun karyawan "${employee.name}" berstatus ${employee.status}. Hubungi Apoteker Penanggung Jawab.`,
          });
        }
        req.user = {
          uid: payload.uid,
          email: employee.email || `${employee.nip.toLowerCase()}@latishafarma.id`,
          name: employee.name,
          role: resolveEmployeeAppRole(employee),
          nip: employee.nip,
          jobTitle: employee.role,
        };
        return next();
      }
      // Fallback to token payload if DB was freshly re-initialized before seed ran
      req.user = {
        uid: payload.uid,
        email: payload.email || `${payload.nip.toLowerCase()}@latishafarma.id`,
        name: payload.name,
        role: payload.role || 'apoteker',
        nip: payload.nip,
        jobTitle: payload.jobTitle || 'Apoteker Operasional',
      };
      return next();
    } catch (error) {
      console.error('Error verifying employee session:', error);
      return res.status(500).json({ error: 'Gagal memverifikasi sesi karyawan.' });
    }
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const dbUser = await getOrCreateUser(
      decodedToken.uid,
      decodedToken.email || `${decodedToken.uid}@latishafarma.id`,
      decodedToken.name || 'Apoteker Latisha'
    );

    req.user = {
      uid: decodedToken.uid,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role || 'apoteker',
    };
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Token tidak valid atau kedaluwarsa.' });
  }
};
