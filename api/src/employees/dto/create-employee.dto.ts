import { IsString, IsOptional, IsEmail, IsBoolean, Matches } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  name: string;

  @IsString()
  cpf: string;

  @Matches(/^\d{2}:\d{2}$/)
  workStart: string;

  @Matches(/^\d{2}:\d{2}$/)
  workEnd: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  lunchStart?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  lunchEnd?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}