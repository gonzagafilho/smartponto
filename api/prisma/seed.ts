import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@smartponto.com';
  const pass = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    console.log('✅ SUPER_ADMIN já existe:', email);
    return;
  }

  const hash = await bcrypt.hash(pass, 10);

  await prisma.user.create({
    data: {
      name: 'Super Admin',
      email,
      passwordHash: hash,
      role: UserRole.SUPER_ADMIN,
    },
  });

  console.log('✅ SUPER_ADMIN criado:', email, 'senha:', pass);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
