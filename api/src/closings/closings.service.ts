import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function parseYearMonthOrThrow(v: string): string {
  const s = (v || "").trim();
  if (!/^\d{4}-\d{2}$/.test(s)) throw new BadRequestException("month inválido. Use YYYY-MM");
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new BadRequestException("month inválido. Use YYYY-MM");
  }
  return s;
}

function minutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

@Injectable()
export class ClosingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retorna resumos fechados do tenant no mês (closedAt preenchido).
   * Usado para gerar o PDF.
   */
  async getClosedSummariesForPdf(tenantId: string, month: string) {
    const ym = parseYearMonthOrThrow(month);

    const summaries = await this.prisma.monthlySummary.findMany({
      where: {
        tenantId,
        yearMonth: ym,
        closedAt: { not: null },
      },
      include: {
        employee: { select: { id: true, name: true, cpf: true } },
      },
      orderBy: { employee: { name: "asc" } },
    });

    if (summaries.length === 0) {
      throw new NotFoundException(
        `Nenhum fechamento encontrado para ${ym}. Feche o mês antes de gerar o PDF.`,
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    return {
      month: ym,
      tenantName: tenant?.name ?? "Empresa",
      rows: summaries.map((s) => ({
        employeeName: s.employee.name,
        cpf: s.employee.cpf,
        targetMinutes: s.targetMinutes,
        targetHHMM: minutesToHHMM(s.targetMinutes),
        workedMinutes: s.workedMinutes,
        workedHHMM: minutesToHHMM(s.workedMinutes),
        extraMinutes: s.extraMinutes,
        extraHHMM: minutesToHHMM(s.extraMinutes),
        debitMinutes: s.debitMinutes,
        debitHHMM: minutesToHHMM(s.debitMinutes),
        daysWorked: s.daysWorked,
        inconsistenciesCount: s.inconsistenciesCount,
      })),
      totals: {
        workedMinutes: summaries.reduce((a, s) => a + s.workedMinutes, 0),
        extraMinutes: summaries.reduce((a, s) => a + s.extraMinutes, 0),
        debitMinutes: summaries.reduce((a, s) => a + s.debitMinutes, 0),
      },
    };
  }

  /**
   * Gera PDF A4 com logo SmartPonto, lista de funcionários e totais.
   */
  async generatePdfBuffer(tenantId: string, month: string): Promise<Buffer> {
    const data = await this.getClosedSummariesForPdf(tenantId, month);

    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const PDFDocument = require("pdfkit");
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth = doc.page.width - 100;
      const col = (n: number, total: number): number => 50 + (pageWidth * n) / total;

      // ---- Cabeçalho: logo SmartPonto ----
      doc.fontSize(22).font("Helvetica-Bold").text("SmartPonto", 50, 50);
      doc.fontSize(10).font("Helvetica").text("Relatório de Fechamento Mensal", 50, 78);
      doc.moveDown();

      // ---- Empresa e mês ----
      doc.fontSize(11).font("Helvetica-Bold").text(`${data.tenantName} — ${data.month}`, 50, 100);
      doc.fontSize(9).font("Helvetica").text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 50, 118);
      doc.moveDown(1.5);

      let y = 145;

      // ---- Tabela: cabeçalho ----
      doc.fontSize(9).font("Helvetica-Bold");
      doc.text("Funcionário", col(0, 4), y);
      doc.text("Trabalhado", col(1, 4), y);
      doc.text("Extra", col(2, 4), y);
      doc.text("Débito", col(3, 4), y);
      doc.text("Dias", 50 + pageWidth - 40, y);
      y += 18;

      doc.moveTo(50, y).lineTo(50 + pageWidth, y).stroke();
      y += 10;

      doc.font("Helvetica");

      for (const row of data.rows) {
        if (y > 700) {
          doc.addPage({ size: "A4", margin: 50 });
          y = 50;
        }
        doc.fontSize(9).text(row.employeeName.slice(0, 28), col(0, 4), y);
        doc.text(row.workedHHMM, col(1, 4), y);
        doc.text(row.extraHHMM, col(2, 4), y);
        doc.text(row.debitHHMM, col(3, 4), y);
        doc.text(String(row.daysWorked), 50 + pageWidth - 40, y);
        y += 16;
      }

      y += 8;
      doc.moveTo(50, y).lineTo(50 + pageWidth, y).stroke();
      y += 14;

      // ---- Totais ----
      doc.font("Helvetica-Bold").fontSize(10);
      doc.text(
        `Totais (${data.rows.length} funcionário(s)) — Trabalhado: ${minutesToHHMM(data.totals.workedMinutes)} | Extra: ${minutesToHHMM(data.totals.extraMinutes)} | Débito: ${minutesToHHMM(data.totals.debitMinutes)}`,
        50,
        y,
      );

      doc.end();
    });
  }
}
