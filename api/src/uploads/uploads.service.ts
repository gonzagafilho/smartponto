import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UploadsService {
  constructor(private readonly prisma: PrismaService) {}

  async assertEmployeeBelongsToTenant(tenantId: string, employeeId: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { id: true },
    });

    if (!emp) {
      // pode ser "não existe" ou "não pertence ao tenant"
      // pra segurança, não detalhar demais
      throw new NotFoundException("Funcionário não encontrado");
    }
  }
}
