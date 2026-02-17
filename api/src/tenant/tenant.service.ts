import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async createTenant(data: {
    name: string;
    slug: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
  }) {
    const exists = await this.prisma.tenant.findUnique({
      where: { slug: data.slug },
    });

    if (exists) throw new BadRequestException('Slug já existe');

    const hash = await bcrypt.hash(data.adminPassword, 10);

    const tenant = await this.prisma.tenant.create({
      data: {
        name: data.name,
        slug: data.slug,
        users: {
          create: {
            name: data.adminName,
            email: data.adminEmail,
            passwordHash: hash,
            role: 'TENANT_ADMIN',
          },
        },
      },
      include: { users: true },
    });

    return { ok: true, tenant };
  }
}
