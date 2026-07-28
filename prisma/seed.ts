import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // =========================
  // Roles
  // =========================

  const administrator = await prisma.role.upsert({
    where: { name: 'Administrator' },
    update: {},
    create: {
      name: 'Administrator',
    },
  });

  await prisma.role.upsert({
    where: { name: 'Building & Grounds Officer' },
    update: {},
    create: {
      name: 'Building & Grounds Officer',
    },
  });

  await prisma.role.upsert({
    where: { name: 'Campus Staff' },
    update: {},
    create: {
      name: 'Campus Staff',
    },
  });

  await prisma.role.upsert({
    where: { name: 'Property Custodian' },
    update: {},
    create: {
      name: 'Property Custodian',
    },
  });

  await prisma.role.upsert({
    where: { name: 'Faculty' },
    update: {},
    create: {
      name: 'Faculty',
    },
  });

  // =========================
  // Default Administrator
  // =========================

  const passwordHash = await bcrypt.hash(
    process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123',
    10,
  );

  await prisma.user.upsert({
    where: {
      email: 'admin@norsu.edu.ph',
    },
    update: {},
    create: {
      email: 'admin@norsu.edu.ph',
      passwordHash,
      firstName: 'System',
      lastName: 'Administrator',
      roleId: administrator.id,
    },
  });

  console.log('✅ Database seeded successfully!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });