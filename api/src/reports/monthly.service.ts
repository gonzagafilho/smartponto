import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function parseYearMonthOrThrow(v: string): { ym: string; year: number; month: number } {
  const s = (v || "").trim();
  if (!/^\d{4}-\d{2}$/.test(s)) throw new BadRequestException("month inválido. Use YYYY-MM");
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new BadRequestException("month inválido. Use YYYY-MM");
  }
  return { ym: s, year, month };
}

function dayKeyInTz(d: Date, timeZone: string): string {
  // en-CA => YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function isWeekendInTz(d: Date, timeZone: string): boolean {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(d);
  return wd === "Sat" || wd === "Sun";
}

function minutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type DayDetail = {
  date: string; // YYYY-MM-DD (TZ do tenant)
  firstIn: string | null;
  lunchOut: string | null;
  lunchIn: string | null;
  lastOut: string | null;
  workedMinutes: number;
  workedHHMM: string;
  flags: string[];
  punches: Array<{ type: string; punchedAt: string; isOffline: boolean; deviceId: string | null }>;
};

@Injectable()
export class MonthlyService {
  constructor(private readonly prisma: PrismaService) {}

  async monthlySummary(params: { tenantId: string; employeeId: string; month: string }) {
    const tenantId = params.tenantId;
    const employeeId = (params.employeeId || "").trim();
    if (!employeeId) throw new BadRequestException("employeeId é obrigatório");

    const { ym, year, month } = parseYearMonthOrThrow(params.month);

    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { id: true, name: true, cpf: true, isActive: true },
    });
    if (!emp) throw new NotFoundException("Funcionário não encontrado");
    if (!emp.isActive) throw new BadRequestException("Funcionário inativo");

    // ✅ Se já existe resumo fechado, retorna SEM sobrescrever
    const existing = await this.prisma.monthlySummary.findUnique({
      where: {
        uniq_monthly_summary: {
          tenantId,
          employeeId,
          yearMonth: ym,
        },
      },
    });

    if (existing?.closedAt) {
      const payload = existing.detailsJson as any;

      // Se temos o payload completo salvo, devolve ele
      if (payload && typeof payload === "object") {
        return {
          ...payload,
          persisted: true,
          generatedAt: existing.generatedAt.toISOString(),
          closedAt: existing.closedAt.toISOString(),
        };
      }

      // fallback mínimo (caso detailsJson esteja vazio)
      return {
        ok: true,
        employee: emp,
        month: ym,
        totals: {
          targetMinutes: existing.targetMinutes,
          targetHHMM: minutesToHHMM(existing.targetMinutes),
          workedMinutes: existing.workedMinutes,
          workedHHMM: minutesToHHMM(existing.workedMinutes),
          extraMinutes: existing.extraMinutes,
          extraHHMM: minutesToHHMM(existing.extraMinutes),
          debitMinutes: existing.debitMinutes,
          debitHHMM: minutesToHHMM(existing.debitMinutes),
          daysWorked: existing.daysWorked,
          daysExpected: null,
          inconsistenciesCount: existing.inconsistenciesCount,
        },
        days: [],
        persisted: true,
        generatedAt: existing.generatedAt.toISOString(),
        closedAt: existing.closedAt.toISOString(),
      };
    }

    const settings = await this.prisma.tenantSettings.findFirst({
      where: { tenantId },
    });

    const timeZone = settings?.timezone || "America/Sao_Paulo";
    const targetMode = (settings?.targetMode as any) || "MONTHLY";
    const targetDailyMinutes = settings?.targetDailyMinutes ?? 480;
    const targetMonthlyMinutes = settings?.targetMonthlyMinutes ?? 13200;
    const lunchDeductMode = (settings?.lunchDeductMode as any) || "BY_PUNCH";
    const fixedLunchMinutes = settings?.fixedLunchMinutes ?? 60;
    const roundingMinutes = settings?.roundingMinutes ?? 0;

    // Busca UTC do mês (amplo). Agrupamento será no fuso do tenant.
    const startUtc = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endUtc = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    const rows = await this.prisma.timeEntry.findMany({
      where: {
        tenantId,
        employeeId,
        punchedAt: { gte: startUtc, lt: endUtc },
      },
      orderBy: { punchedAt: "asc" },
      select: {
        type: true,
        punchedAt: true,
        isOffline: true,
        deviceId: true,
      },
    });

    // Agrupar por dia no TZ do tenant
    const byDay = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = dayKeyInTz(r.punchedAt, timeZone);
      const arr = byDay.get(key) || [];
      arr.push(r);
      byDay.set(key, arr);
    }

    // Days expected (somente se modo DAILY; por padrão, dias úteis)
    let daysExpected = 0;
    if (targetMode === "DAILY") {
      for (let d = new Date(startUtc.getTime()); d.getTime() < endUtc.getTime(); ) {
        if (!isWeekendInTz(d, timeZone)) daysExpected++;
        d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    const details: DayDetail[] = [];
    let inconsistenciesCount = 0;

    for (const [date, list] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const flags: string[] = [];
      const punches = list.map((p) => ({
        type: p.type,
        punchedAt: p.punchedAt.toISOString(),
        isOffline: !!p.isOffline,
        deviceId: p.deviceId,
      }));

      const firstIn = list.find((p) => p.type === "IN")?.punchedAt ?? null;
      const lunchOut = list.find((p) => p.type === "LUNCH_OUT")?.punchedAt ?? null;
      const lunchIn = list.find((p) => p.type === "LUNCH_IN")?.punchedAt ?? null;
      const lastOut = [...list].reverse().find((p) => p.type === "OUT")?.punchedAt ?? null;

      // Inconsistências
      if (firstIn && !lastOut) flags.push("MISSING_OUT");
      if (!firstIn && lastOut) flags.push("MISSING_IN");
      if (lunchOut && !lunchIn) flags.push("MISSING_LUNCH_IN");
      if (!lunchOut && lunchIn) flags.push("MISSING_LUNCH_OUT");

      if (flags.length > 0) inconsistenciesCount += 1;

      let workedMinutes = 0;

      if (firstIn && lastOut && lastOut.getTime() > firstIn.getTime()) {
        // Base: OUT - IN
        workedMinutes = Math.floor((lastOut.getTime() - firstIn.getTime()) / 60000);

        if (lunchDeductMode === "BY_PUNCH") {
          if (lunchOut && lunchIn && lunchIn.getTime() > lunchOut.getTime()) {
            workedMinutes -= Math.floor((lunchIn.getTime() - lunchOut.getTime()) / 60000);
          } else if (lunchOut || lunchIn) {
            // almoço incompleto: não desconta e marca flag
            flags.push("LUNCH_INCOMPLETE_NO_DEDUCT");
          }
        } else {
          // FIXED
          workedMinutes -= fixedLunchMinutes;
        }
      } else {
        workedMinutes = 0;
      }

      if (workedMinutes < 0) workedMinutes = 0;

      // Arredondamento opcional por dia
      if (roundingMinutes && roundingMinutes > 0) {
        workedMinutes = Math.round(workedMinutes / roundingMinutes) * roundingMinutes;
      }

      details.push({
        date,
        firstIn: firstIn ? firstIn.toISOString() : null,
        lunchOut: lunchOut ? lunchOut.toISOString() : null,
        lunchIn: lunchIn ? lunchIn.toISOString() : null,
        lastOut: lastOut ? lastOut.toISOString() : null,
        workedMinutes,
        workedHHMM: minutesToHHMM(workedMinutes),
        flags,
        punches,
      });
    }

    const workedTotal = details.reduce((acc, d) => acc + d.workedMinutes, 0);

    const targetMinutes =
      targetMode === "MONTHLY" ? targetMonthlyMinutes : targetDailyMinutes * daysExpected;

    const delta = workedTotal - targetMinutes;
    const extraMinutes = delta > 0 ? delta : 0;
    const debitMinutes = delta < 0 ? Math.abs(delta) : 0;

    // ✅ payload completo (o que será salvo no detailsJson)
    const payload: any = {
      ok: true,
      employee: emp,
      settings: {
        timezone: timeZone,
        targetMode,
        targetDailyMinutes,
        targetMonthlyMinutes,
        lunchDeductMode,
        fixedLunchMinutes,
        roundingMinutes,
      },
      month: ym,
      rangeUtc: { startUtc: startUtc.toISOString(), endUtc: endUtc.toISOString() },
      totals: {
        targetMinutes,
        targetHHMM: minutesToHHMM(targetMinutes),
        workedMinutes: workedTotal,
        workedHHMM: minutesToHHMM(workedTotal),
        extraMinutes,
        extraHHMM: minutesToHHMM(extraMinutes),
        debitMinutes,
        debitHHMM: minutesToHHMM(debitMinutes),
        daysWorked: details.filter((d) => d.workedMinutes > 0).length,
        daysExpected: targetMode === "DAILY" ? daysExpected : null,
        inconsistenciesCount,
      },
      days: details,
    };

    const now = new Date();

    // ✅ Upsert (persistência) — NÃO mexe no closedAt
    const saved = await this.prisma.monthlySummary.upsert({
      where: {
        uniq_monthly_summary: {
          tenantId,
          employeeId,
          yearMonth: ym,
        },
      },
      create: {
        tenantId,
        employeeId,
        yearMonth: ym,

        targetMinutes,
        workedMinutes: workedTotal,
        extraMinutes,
        debitMinutes,

        daysWorked: payload.totals.daysWorked,
        inconsistenciesCount,

        detailsJson: payload,
        generatedAt: now,
      },
      update: {
        targetMinutes,
        workedMinutes: workedTotal,
        extraMinutes,
        debitMinutes,

        daysWorked: payload.totals.daysWorked,
        inconsistenciesCount,

        detailsJson: payload,
        generatedAt: now,
      },
    });

    return {
      ...payload,
      persisted: true,
      generatedAt: saved.generatedAt.toISOString(),
      closedAt: saved.closedAt ? saved.closedAt.toISOString() : null,
    };
  }

  async closeMonthlySummary(params: { tenantId: string; employeeId: string; month: string }) {
    const tenantId = params.tenantId;
    const employeeId = (params.employeeId || "").trim();
    if (!employeeId) throw new BadRequestException("employeeId é obrigatório");

    const { ym } = parseYearMonthOrThrow(params.month);

    // garante que existe e que está persistido (se já estiver fechado, monthlySummary retorna o fechado)
    await this.monthlySummary({ tenantId, employeeId, month: ym });

    const existing = await this.prisma.monthlySummary.findUnique({
      where: {
        uniq_monthly_summary: { tenantId, employeeId, yearMonth: ym },
      },
    });

    if (!existing) throw new NotFoundException("Resumo mensal não encontrado");

    // se já está fechado, só devolve
    if (existing.closedAt) {
      const payload = existing.detailsJson as any;
      if (payload && typeof payload === "object") {
        return {
          ...payload,
          persisted: true,
          generatedAt: existing.generatedAt.toISOString(),
          closedAt: existing.closedAt.toISOString(),
        };
      }
      return {
        ok: true,
        tenantId,
        employeeId,
        month: ym,
        closedAt: existing.closedAt.toISOString(),
        generatedAt: existing.generatedAt.toISOString(),
      };
    }

    const updated = await this.prisma.monthlySummary.update({
      where: {
        uniq_monthly_summary: { tenantId, employeeId, yearMonth: ym },
      },
      data: { closedAt: new Date() },
    });

    const payload = updated.detailsJson as any;
    if (payload && typeof payload === "object") {
      return {
        ...payload,
        persisted: true,
        generatedAt: updated.generatedAt.toISOString(),
        closedAt: updated.closedAt ? updated.closedAt.toISOString() : null,
      };
    }

    return {
      ok: true,
      tenantId,
      employeeId,
      month: ym,
      persisted: true,
      generatedAt: updated.generatedAt.toISOString(),
      closedAt: updated.closedAt ? updated.closedAt.toISOString() : null,
    };
  }

  /**
   * Fechamento mensal por tenant (1 clique): garante summary para cada employee ativo,
   * depois seta closedAt = now() em todos do yearMonth.
   */
  async closeMonth(params: { tenantId: string; yearMonth: string }) {
    const { tenantId, yearMonth } = params;
    const { ym } = parseYearMonthOrThrow(yearMonth);

    const employees = await this.prisma.employee.findMany({
      where: { tenantId, isActive: true },
      select: { id: true },
    });

    const closedEmployees: string[] = [];
    const alreadyClosed: string[] = [];

    for (const emp of employees) {
      await this.monthlySummary({ tenantId, employeeId: emp.id, month: ym });

      const existing = await this.prisma.monthlySummary.findUnique({
        where: {
          uniq_monthly_summary: { tenantId, employeeId: emp.id, yearMonth: ym },
        },
        select: { closedAt: true },
      });

      if (!existing) continue;

      if (existing.closedAt) {
        alreadyClosed.push(emp.id);
      } else {
        await this.prisma.monthlySummary.update({
          where: {
            uniq_monthly_summary: { tenantId, employeeId: emp.id, yearMonth: ym },
          },
          data: { closedAt: new Date() },
        });
        closedEmployees.push(emp.id);
      }
    }

    return {
      ok: true,
      yearMonth: ym,
      closedEmployees,
      alreadyClosed,
    };
  }

  /**
   * Reabre o mês (closedAt = null) para todos os summaries do tenant no yearMonth. Somente admin.
   */
  async reopenMonth(params: { tenantId: string; yearMonth: string }) {
    const { tenantId, yearMonth } = params;
    const { ym } = parseYearMonthOrThrow(yearMonth);

    const result = await this.prisma.monthlySummary.updateMany({
      where: { tenantId, yearMonth: ym },
      data: { closedAt: null },
    });

    return {
      ok: true,
      yearMonth: ym,
      reopenedCount: result.count,
    };
  }

  /**
   * Gera PDF A4 do resumo mensal baseado em MonthlySummary fechados.
   * Se não houver summaries com closedAt no mês, retorna 400 pedindo fechar primeiro.
   */
  async getMonthlySummaryPdfBuffer(tenantId: string, month: string): Promise<Buffer> {
    const { ym } = parseYearMonthOrThrow(month);

    const summaries = await this.prisma.monthlySummary.findMany({
      where: {
        tenantId,
        yearMonth: ym,
        closedAt: { not: null },
      },
      include: { employee: { select: { name: true, cpf: true } } },
      orderBy: { employee: { name: "asc" } },
    });

    if (summaries.length === 0) {
      throw new BadRequestException(
        "Mês não está fechado ou não há resumos fechados. Feche o mês antes de gerar o PDF.",
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        logoUrl: true,
        settings: { select: { targetMonthlyMinutes: true } },
      },
    });
    const tenantName = tenant?.name ?? "Empresa";
    const workloadHours =
      tenant?.settings?.targetMonthlyMinutes != null
        ? Math.round(tenant.settings.targetMonthlyMinutes / 60)
        : 220;

    let logoBuffer: Buffer | null = null;
    if (tenant?.logoUrl) {
      try {
        const res = await fetch(tenant.logoUrl);
        if (res.ok) logoBuffer = Buffer.from(await res.arrayBuffer());
      } catch {
        // não quebrar o PDF se a logo falhar
      }
    }

    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const PDFDocument = require("pdfkit");
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth = doc.page.width - 100;
      const rightX = 50 + pageWidth;
      const col = (n: number, total: number): number => 50 + (pageWidth * n) / total;

      let y = 50;

      // Logo (canto superior direito), se existir
      if (logoBuffer && logoBuffer.length > 0) {
        try {
          const logoW = 80;
          const logoH = 40;
          doc.image(logoBuffer, rightX - logoW, y, { width: logoW, height: logoH });
        } catch {
          // ignora erro de imagem
        }
      }

      // Cabeçalho profissional
      doc.fontSize(22).font("Helvetica-Bold").text("SmartPonto", 50, y);
      y += 22;
      doc.fontSize(12).font("Helvetica").text("RESUMO MENSAL DE PONTO", 50, y);
      y += 20;
      doc.fontSize(10).font("Helvetica");
      doc.text(`Empresa: ${tenantName}`, 50, y);
      y += 14;
      doc.text(`Mês: ${ym}`, 50, y);
      y += 14;
      const geradoEm = new Date().toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      doc.text(`Gerado em: ${geradoEm}`, 50, y);
      y += 20;

      // Carga horária mensal
      doc.fontSize(10).text(`Carga horária mensal: ${workloadHours}h`, 50, y);
      y += 22;

      doc.moveDown(0.5);

      // Tabela: Funcionário | CPF | Trabalhado | Extra | Débito | Inconsistências (6 colunas)
      doc.fontSize(10).font("Helvetica-Bold");
      doc.text("Funcionário", col(0, 6), y);
      doc.text("CPF", col(1, 6), y);
      doc.text("Trabalhado", col(2, 6), y);
      doc.text("Extra", col(3, 6), y);
      doc.text("Débito", col(4, 6), y);
      doc.text("Inconsist.", col(5, 6), y);
      y += 18;
      doc.moveTo(50, y).lineTo(rightX, y).stroke();
      y += 12;
      doc.font("Helvetica").fontSize(10);

      function formatCpf(cpf: string | null | undefined): string {
        if (!cpf || typeof cpf !== "string") return "—";
        const d = cpf.replace(/\D/g, "");
        if (d.length !== 11) return cpf.slice(0, 14);
        return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
      }

      for (const s of summaries) {
        if (y > 700) {
          doc.addPage({ size: "A4", margin: 50 });
          y = 50;
        }
        const workedHHMM = minutesToHHMM(s.workedMinutes);
        const extraHHMM = minutesToHHMM(s.extraMinutes);
        const debitHHMM = minutesToHHMM(s.debitMinutes);
        doc
          .text((s.employee.name || "—").slice(0, 28), col(0, 6), y)
          .text(formatCpf(s.employee.cpf), col(1, 6), y)
          .text(workedHHMM, col(2, 6), y)
          .text(extraHHMM, col(3, 6), y)
          .text(debitHHMM, col(4, 6), y)
          .text(String(s.inconsistenciesCount), col(5, 6), y);
        y += 16;
      }

      y += 10;
      doc.moveTo(50, y).lineTo(rightX, y).stroke();
      y += 20;

      // Totais em destaque (centralizado, negrito)
      const totalWorked = summaries.reduce((a, s) => a + s.workedMinutes, 0);
      const totalExtra = summaries.reduce((a, s) => a + s.extraMinutes, 0);
      const totalDebit = summaries.reduce((a, s) => a + s.debitMinutes, 0);
      doc.font("Helvetica-Bold").fontSize(11);
      const totalLines = [
        `Funcionários: ${summaries.length}`,
        `Trabalhado: ${minutesToHHMM(totalWorked)}`,
        `Extra: ${minutesToHHMM(totalExtra)}`,
        `Débito: ${minutesToHHMM(totalDebit)}`,
      ];
      for (const line of totalLines) {
        doc.text(line, 50, y, { width: pageWidth, align: "center" });
        y += 16;
      }

      y += 28;

      // Assinaturas no rodapé
      doc.font("Helvetica").fontSize(10);
      doc.moveTo(50, y).lineTo(50 + 180, y).stroke();
      doc.text("Responsável RH", 50, y + 8, { width: 180 });
      y += 36;
      doc.moveTo(50, y).lineTo(50 + 180, y).stroke();
      doc.text("Administrador", 50, y + 8, { width: 180 });

      doc.end();
    });
  }
}