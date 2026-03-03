const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const name = "Admin Global";
  const email = "dc.net.infinity@gmail.com";
  const password = "Marilene0310";

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.systemAdmin.upsert({
    where: { email },
    update: { name, passwordHash, isActive: true },
    create: { name, email, passwordHash, isActive: true },
  });

  console.log("SYSTEM_ADMIN_OK:", admin);
}

main()
  .catch((e) => {
    console.error("ERR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
