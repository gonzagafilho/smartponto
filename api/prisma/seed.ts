import "dotenv/config";
import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

type PlanSeed = {
  code: string;
  name: string;
  priceCents: number;
  maxEmployees: number | null; // null = ilimitado
  maxWorksites: number | null; // null = ilimitado
};

const PLANS: PlanSeed[] = [
  { code: "STARTER", name: "Starter", priceCents: 2990, maxEmployees: 10, maxWorksites: 2 },
  { code: "PRO", name: "Pro", priceCents: 5990, maxEmployees: 30, maxWorksites: 5 },
  { code: "ENTERPRISE", name: "Enterprise", priceCents: 9900, maxEmployees: null, maxWorksites: null },
];

async function seedSuperAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL || "admin@smartponto.com";
  const pass = process.env.SEED_ADMIN_PASSWORD || "Admin@123456";

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    console.log("✅ SUPER_ADMIN já existe:", email);
    return;
  }

  const hash = await bcrypt.hash(pass, 10);

  await prisma.user.create({
    data: {
      name: "Super Admin",
      email,
      passwordHash: hash,
      role: UserRole.SUPER_ADMIN,
    },
  });

  console.log("✅ SUPER_ADMIN criado:", email, "senha:", pass);
}

async function seedPlans() {
  for (const p of PLANS) {
    await prisma.plan.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        name: p.name,
        priceCents: p.priceCents,
        currency: "BRL",
        isActive: true,
        maxEmployees: p.maxEmployees,
        maxWorksites: p.maxWorksites,
      },
      update: {
        name: p.name,
        priceCents: p.priceCents,
        currency: "BRL",
        isActive: true,
        maxEmployees: p.maxEmployees,
        maxWorksites: p.maxWorksites,
      },
    });
  }

  console.log(`✅ Plans SmartPonto upsert OK (${PLANS.length})`);
}

async function seedSubscriptionsForTenants() {
  // default: STARTER em TRIAL
  const defaultPlan = await prisma.plan.findUnique({ where: { code: "STARTER" } });
  if (!defaultPlan) throw new Error('Plan "STARTER" não encontrado (seedPlans falhou).');

  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  let created = 0;
  let skipped = 0;

  for (const t of tenants) {
    const hasSub = await prisma.subscription.findFirst({
      where: { tenantId: t.id },
      select: { id: true },
    });

    if (hasSub) {
      skipped++;
      continue;
    }

    await prisma.subscription.create({
      data: {
        tenantId: t.id,
        planId: defaultPlan.id,
        status: "TRIAL",
        startedAt: new Date(),
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
      },
    });

    created++;
  }

  console.log(`✅ Subscriptions (TRIAL): criadas=${created}, já existiam=${skipped}`);
}

/** Garante que o tenant do user admin@empresa.com tenha Subscription ACTIVE no plano PRO. */
async function seedTenantAdminPro() {
  const tenantAdminEmail = process.env.SEED_TENANT_ADMIN_EMAIL || "admin@empresa.com";
  const user = await prisma.user.findFirst({
    where: { email: tenantAdminEmail },
    select: { tenantId: true },
  });
  if (!user?.tenantId) {
    console.log(`⏭️ Tenant admin: user "${tenantAdminEmail}" não encontrado ou sem tenantId, pulando.`);
    return;
  }

  const proPlan = await prisma.plan.findUnique({ where: { code: "PRO" } });
  if (!proPlan) throw new Error('Plan "PRO" não encontrado (seedPlans falhou).');

  const existing = await prisma.subscription.findFirst({
    where: { tenantId: user.tenantId },
    orderBy: { startedAt: "desc" },
  });

  if (existing) {
    await prisma.subscription.update({
      where: { id: existing.id },
      data: { planId: proPlan.id, status: "ACTIVE" },
    });
    console.log(`✅ Tenant admin (${tenantAdminEmail}): assinatura atualizada para PRO ACTIVE.`);
  } else {
    await prisma.subscription.create({
      data: {
        tenantId: user.tenantId,
        planId: proPlan.id,
        status: "ACTIVE",
        startedAt: new Date(),
      },
    });
    console.log(`✅ Tenant admin (${tenantAdminEmail}): assinatura criada PRO ACTIVE.`);
  }
}

async function main() {
  await seedSuperAdmin();
  await seedPlans();
  await seedSubscriptionsForTenants();
  await seedTenantAdminPro();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });