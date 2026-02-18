import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as bcrypt from "bcrypt";

function toSlug(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || "");
}

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async createTenant(data: {
    name: string;
    slug?: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
  }) {
    const name = (data.name || "").trim();
    if (!name) throw new BadRequestException("name (ou tenantName) é obrigatório");

    const slug = (data.slug || "").trim() || toSlug(name);
    if (!slug) throw new BadRequestException("slug inválido");

    const adminName = (data.adminName || "").trim();
    if (!adminName) throw new BadRequestException("adminName é obrigatório");

    const adminEmail = (data.adminEmail || "").trim().toLowerCase();
    if (!adminEmail) throw new BadRequestException("adminEmail é obrigatório");
    if (!isEmail(adminEmail)) throw new BadRequestException("adminEmail inválido");

    const adminPassword = data.adminPassword || "";
    if (!adminPassword) throw new BadRequestException("adminPassword é obrigatório");
    if (adminPassword.length < 6) {
      throw new BadRequestException("adminPassword deve ter no mínimo 6 caracteres");
    }

    const exists = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (exists) throw new BadRequestException("Slug já existe");

    const emailExists = await this.prisma.user.findUnique({
      where: { email: adminEmail },
      select: { id: true },
    });
    if (emailExists) throw new BadRequestException("adminEmail já está em uso");

    const hash = await bcrypt.hash(adminPassword, 10);

    const tenant = await this.prisma.tenant.create({
      data: {
        name,
        slug,
        users: {
          create: {
            name: adminName,
            email: adminEmail,
            passwordHash: hash,
            role: "TENANT_ADMIN",
          },
        },
      },
      include: { users: true },
    });

    return { ok: true, tenant };
  }
}
