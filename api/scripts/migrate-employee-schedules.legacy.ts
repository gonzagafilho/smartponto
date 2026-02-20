import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes("--dry");
  console.log(`[MIGRATE] start (dryRun=${dryRun})`);

  // Pega employees que ainda têm legado preenchido
  const employees = await prisma.employee.findMany({
    where: {
      scheduleId: { not: null },
      scheduleStartAt: { not: null },
    },
    select: {
      id: true,
      tenantId: true,
      scheduleId: true,
      scheduleStartAt: true,
      name: true,
    },
  });

  console.log(`[MIGRATE] found employees with legacy schedule fields: ${employees.length}`);

  let created = 0;
  let skipped = 0;

  for (const e of employees) {
    const tenantId = e.tenantId;
    const employeeId = e.id;
    const scheduleId = e.scheduleId!;
    const startAt = e.scheduleStartAt!;

    // Já existe um vínculo começando exatamente nessa data?
    const exists = await prisma.employeeSchedule.findFirst({
      where: { tenantId, employeeId, scheduleId, startAt },
      select: { id: true },
    });

    if (exists) {
      skipped++;
      console.log(`[SKIP] ${e.name} (${employeeId}) already has EmployeeSchedule at ${startAt.toISOString()}`);
      continue;
    }

    // Também evita duplicidade por período: se já existe qualquer vínculo ativo cobrindo startAt, pula
    const covering = await prisma.employeeSchedule.findFirst({
      where: {
        tenantId,
        employeeId,
        startAt: { lte: startAt },
        OR: [{ endAt: null }, { endAt: { gte: startAt } }],
      },
      select: { id: true, startAt: true, endAt: true },
    });

    if (covering) {
      skipped++;
      console.log(
        `[SKIP] ${e.name} (${employeeId}) legacy startAt ${startAt.toISOString()} is covered by existing EmployeeSchedule ${covering.id} (${covering.startAt.toISOString()}..${covering.endAt ? covering.endAt.toISOString() : "null"})`,
      );
      continue;
    }

    console.log(
      `[CREATE] ${e.name} (${employeeId}) scheduleId=${scheduleId} startAt=${startAt.toISOString()}`,
    );

    if (!dryRun) {
      await prisma.employeeSchedule.create({
        data: {
          tenantId,
          employeeId,
          scheduleId,
          startAt,
          endAt: null,
        },
      });
    }

    created++;
  }

  console.log(`[MIGRATE] done. created=${created} skipped=${skipped}`);

  // Pós-validação: listar quem ainda não tem vínculo algum (pra você corrigir depois)
  const employeesNoLink = await prisma.employee.findMany({
    select: { id: true, tenantId: true, name: true },
  });

  let noLinkCount = 0;
  for (const e of employeesNoLink) {
    const link = await prisma.employeeSchedule.findFirst({
      where: { tenantId: e.tenantId, employeeId: e.id },
      select: { id: true },
    });
    if (!link) {
      noLinkCount++;
      console.log(`[NO-LINK] ${e.name} (${e.id}) has NO EmployeeSchedule`);
    }
  }

  console.log(`[MIGRATE] employees without any EmployeeSchedule: ${noLinkCount}`);
}

main()
  .catch((e) => {
    console.error("[MIGRATE] ERROR", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
