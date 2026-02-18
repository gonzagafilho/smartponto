import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@smartponto.com";
  const senha = "Admin@123";

  const passwordHash = await bcrypt.hash(senha, 10);

  // ✅ cria ou atualiza (se já existir)
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "SUPER_ADMIN", name: "Super Admin" },
    create: {
      email,
      passwordHash,
      role: "SUPER_ADMIN",
      name: "Super Admin",
    },
    select: { id: true, email: true, role: true, name: true },
  });

  console.log("✅ SUPER_ADMIN pronto:");
  console.log(user);
  console.log("Senha:", senha);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
