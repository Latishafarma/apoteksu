import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import { users } from './schema.ts';

export async function getOrCreateUser(uid: string, email: string, name: string) {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const [existing] = await db.select().from(users).where(eq(users.uid, uid));

    const resolvedRole = existing?.role || 'apoteker';

    const result = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        name,
        role: resolvedRole,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: normalizedEmail,
          name,
          role: resolvedRole,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Gagal menyinkronkan profil pengguna ke database.', { cause: error });
  }
}
