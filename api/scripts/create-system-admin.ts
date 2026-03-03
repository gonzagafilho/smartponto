import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const name = process.env.SYSTEM_ADMIN_NAME || "Admin Global";
  const email = (process.env.SYSTEM_ADMIN_EMAIL || "admin@workponto.com.br").toLowerCase();
  const pass = process.env.SYSTEM_ADMIN_PASSWORD || "TroqueEssaSenha@123";

  const exists = await prisma.systemAdmin.findUnique({ where: { email } });
  if (exists) {
    console.log("SYSTEM_ADMIN já existe:", email);
    return;
  }

  const passwordHash = await bcrypt.hash(pass, 10);

  const created = await prisma.systemAdmin.create({
    data: { name, email, passwordHash, isActive: true },
  });

  console.log("SYSTEM_ADMIN criado:", { id: created.id, email: created.email });
}

main()
  .catch((e) => {
    console.error("ERR:", e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());