const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const email = "dc.net.infinity@gmail.com";
  const password = "Marilene0310";
  const tenantId = "cmlva4zon00005nvno7yyd9wv";
  const name = "Administrador Global";

  // IMPORTANTE: ajuste o nome do campo de senha conforme seu schema:
  // aqui estou usando passwordHash (muito comum).
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      tenantId,
      role: "TENANT_ADMIN",
      passwordHash,
    },
    create: {
      email,
      name,
      tenantId,
      role: "TENANT_ADMIN",
      passwordHash,
    },
  });

  console.log("USER_OK:", user);
}

main()
  .catch((e) => {
    console.error("CREATE_ADMIN_ERR:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
