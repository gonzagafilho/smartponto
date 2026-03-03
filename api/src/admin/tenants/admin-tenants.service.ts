import { BadRequestException, Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateAdminTenantDto } from "./dto/create-admin-tenant.dto";

@Injectable()
export class AdminTenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { ok: true, tenants };
  }

  async create(dto: CreateAdminTenantDto) {
    const slug = dto.tenantSlug.trim().toLowerCase();

    const exists = await this.prisma.tenant.findUnique({ where: { slug } });
    if (exists) throw new BadRequestException("tenantSlug já existe");

    const email = dto.adminEmail.trim().toLowerCase();
    const userExists = await this.prisma.user.findUnique({ where: { email } });
    if (userExists) throw new BadRequestException("adminEmail já existe");

    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.tenantName, slug, isActive: true },
        select: { id: true, name: true, slug: true, isActive: true, createdAt: true },
      });

      const admin = await tx.user.create({
        data: {
          name: dto.adminName,
          email,
          passwordHash,
          role: "TENANT_ADMIN",
          tenantId: tenant.id,
        },
        select: { id: true, name: true, email: true, role: true, tenantId: true },
      });

      return { tenant, admin };
    });

    return { ok: true, data: result };
  }

  async setActive(tenantId: string, isActive: boolean) {
    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { isActive },
      select: { id: true, slug: true, name: true, isActive: true, updatedAt: true },
    });

    return { ok: true, data: tenant };
  }

  async resetTenantAdminPassword(tenantId: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 10);

    const admin = await this.prisma.user.findFirst({
      where: { tenantId, role: "TENANT_ADMIN" },
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    });

    if (!admin) {
      throw new BadRequestException("Nenhum TENANT_ADMIN encontrado para esse tenant");
    }

    await this.prisma.user.update({
      where: { id: admin.id },
      data: { passwordHash },
    });

    return { ok: true, data: { adminId: admin.id, email: admin.email } };
  }
}