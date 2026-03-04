import { IsString } from "class-validator";

export class EmployeeLoginDto {
  @IsString()
  cpf!: string;
}