import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import * as express from "express";
import { join } from "path";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 🔐 Prefixo global (recomendado para SaaS)
  app.setGlobalPrefix("api");

  // ✅ Validação global (obrigatório para DTO funcionar corretamente)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,            // remove campos extras
      forbidNonWhitelisted: true, // erro se enviar campo inválido
      transform: true,
    })
  );

  // 🌐 CORS (ajuste domínio depois)
  app.enableCors({
    origin: [
      "http://localhost:3000",
      "https://app.workponto.com.br"
    ],
    credentials: true,
  });

  // 📁 Arquivos estáticos
  app.use("/uploads", express.static(join(process.cwd(), "uploads")));

  const port = process.env.PORT || 3011;
  await app.listen(port);

  console.log(`🚀 SmartPonto API rodando na porta ${port}`);
}

bootstrap();