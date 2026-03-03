import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  Matches,
  ValidateIf,
} from "class-validator";

export class CreateTenantDto {
  // 🔹 Aceita name OU tenantName (um dos dois obrigatório)

  @ValidateIf((o) => !o.tenantName)
  @IsString()
  @MinLength(2)
  name?: string;

  @ValidateIf((o) => !o.name)
  @IsString()
  @MinLength(2)
  tenantName?: string;

  // 🔹 Slug opcional (se não enviar, o service gera automaticamente)
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      "Slug deve conter apenas letras minúsculas, números e hífen (ex: cliente-alfa)",
  })
  slug?: string;

  // 🔹 Dados do admin do tenant

  @IsString()
  @MinLength(3)
  adminName: string;

  @IsEmail()
  adminEmail: string;

  @IsString()
  @MinLength(6)
  adminPassword: string;
}