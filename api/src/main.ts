import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import * as express from "express";
import { join } from "path";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ Serve arquivos estáticos: /uploads/...
  app.use("/uploads", express.static(join(process.cwd(), "uploads")));

  await app.listen(3011);
}
bootstrap();
