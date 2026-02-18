export class CreateTenantDto {
  name!: string;         // nome do tenant (ex: DC NET)
  slug?: string;         // opcional (se não mandar, gera automático)

  adminName!: string;
  adminEmail!: string;
  adminPassword!: string;
}
