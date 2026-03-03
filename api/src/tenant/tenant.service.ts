import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as bcrypt from "bcryptjs";

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  // ✅ LISTAR TODOS OS TENANTS (admin master)
  async listTenants() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { ok: true, tenants };
  }

  // ✅ CRIA TENANT + ADMIN DO TENANT
  async createTenant(input: {
    name: string;
    slug?: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
  }) {
    const slug =
      input.slug ||
      input.name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

    // email admin não pode existir
    const existsUser = await this.prisma.user.findUnique({
      where: { email: input.adminEmail },
      select: { id: true },
    });
    if (existsUser) throw new BadRequestException("adminEmail já existe");

    // slug não pode existir
    const existsSlug = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existsSlug) throw new BadRequestException("slug já existe");

    const passwordHash = await bcrypt.hash(input.adminPassword, 10);

    const { tenant, admin } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: input.name, slug },
      });

      const admin = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: input.adminName,
          email: input.adminEmail,
          passwordHash,
          role: "TENANT_ADMIN",
        },
        select: {
          id: true,
          tenantId: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });

      return { tenant, admin };
    });

    return { ok: true, tenant, admin };
  }
}