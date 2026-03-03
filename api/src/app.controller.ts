import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get()
  root() {
    return {
      ok: true,
      service: "smartponto-api",
      prefix: "/api",
      now: new Date().toISOString(),
    };
  }

  @Get("health")
  health() {
    return {
      ok: true,
      status: "up",
      service: "smartponto-api",
      now: new Date().toISOString(),
    };
  }
}