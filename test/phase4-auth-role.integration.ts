import { PrismaClient } from '@prisma/client';
import { AuthService } from '../src/auth/auth.service';

const prisma = new PrismaClient();

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function main() {
  const suffix = Date.now().toString();
  const role = await prisma.role.create({
    data: { code: `PHASE4_${suffix}`, name: `Phase 4 ${suffix}` },
  });
  const user = await prisma.user.create({
    data: { email: `phase4-${suffix}@example.invalid`, passwordHash: 'x', firstName: 'Phase', lastName: 'Four', roleId: role.id },
  });

  let immutable = false;
  try {
    await prisma.role.update({ where: { id: role.id }, data: { code: `CHANGED_${suffix}` } });
  } catch {
    immutable = true;
  }
  check(immutable, 'Role.code was mutable');

  const staleRawToken = `phase4-stale-refresh-token-${suffix}`;
  const staleHash = require('crypto').createHash('sha256').update(staleRawToken).digest('hex');
  await prisma.refreshToken.create({ data: { tokenHash: staleHash, userId: user.id, authVersion: 0, expiresAt: new Date(Date.now() + 60_000) } });
  await prisma.user.update({ where: { id: user.id }, data: { authVersion: 1 } });
  const auth = new AuthService(prisma as any, { sign: () => 'access' } as any, {} as any, {} as any, { disconnectUser() {} } as any);
  let staleRefreshRejected = false;
  try {
    await auth.refresh(staleRawToken);
  } catch {
    staleRefreshRejected = true;
  }
  check(staleRefreshRejected, 'A stale refresh token was accepted');
  console.log('phase4 auth/role integration passed: 2/2 assertions');
}

main().finally(() => prisma.$disconnect());
