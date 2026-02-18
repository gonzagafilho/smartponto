import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";

import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import * as fs from "fs";

import { UploadsService } from "./uploads.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard"; // ✅ usar o que já existe


function safeExt(originalname: string) {
  const e = extname(originalname || "").toLowerCase();
  if (e === ".jpg" || e === ".jpeg") return ".jpg";
  if (e === ".png") return ".png";
  return "";
}

@UseGuards(JwtAuthGuard)
@Controller("uploads")
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post("selfie")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          try {
            const tenantId = (req as any).user?.tenantId;
            const employeeId = (req as any).body?.employeeId;

            if (!tenantId) return cb(new Error("tenantId ausente no token"), "");
            if (!employeeId) return cb(new Error("employeeId ausente"), "");

            const dir = `uploads/selfies/${tenantId}/${employeeId}`;
            fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
          } catch (e: any) {
            cb(e, "");
          }
        },
        filename: (_req, file, cb) => {
          const ext = safeExt(file.originalname);
          if (!ext) return cb(new Error("Formato inválido. Use JPG ou PNG."), "");
          cb(null, `${Date.now()}${ext}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok =
          file.mimetype === "image/jpeg" ||
          file.mimetype === "image/jpg" ||
          file.mimetype === "image/png";
        if (!ok) return cb(new Error("Tipo inválido. Use JPG ou PNG."), false);
        cb(null, true);
      },
    }),
  )
  async uploadSelfie(
    @Req() req: any,
    @Body("employeeId") employeeId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!employeeId) throw new BadRequestException("employeeId é obrigatório");
    if (!file) throw new BadRequestException("Arquivo 'file' é obrigatório");

    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new BadRequestException("tenantId ausente no token");

    await this.uploads.assertEmployeeBelongsToTenant(tenantId, employeeId);

    const selfieUrl = `/${file.path.replace(/\\/g, "/")}`;
    return { ok: true, selfieUrl };
  }
}
