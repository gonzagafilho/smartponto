const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Marilene0310', 10);

  const user = await prisma.user.upsert({
    where: { email: 'dc.net.infinity@gmail.com' },
    update: {},
    create: {
      email: 'dc.net.infinity@gmail.com',
      name: 'Administrador Global',
      password: passwordHash,
      role: 'TENANT_ADMIN',
      tenantId: 'COLOQUE_AQUI_O_TENANT_ID_EXISTENTE'
    }
  });

  console.log(user);
}

main().finally(() => prisma.$disconnect());
