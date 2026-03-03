import { Test, TestingModule } from "@nestjs/testing";
import { AppController } from "./app.controller";

describe("AppController", () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe("root", () => {
    it("should return JSON health payload", () => {
      const res = appController.root();
      expect(res).toHaveProperty("ok", true);
      expect(res).toHaveProperty("service", "smartponto-api");
      expect(res).toHaveProperty("prefix", "/api");
      expect(typeof res.now).toBe("string");
    });
  });

  describe("health", () => {
    it("should return JSON up status", () => {
      const res = appController.health();
      expect(res).toHaveProperty("ok", true);
      expect(res).toHaveProperty("status", "up");
      expect(res).toHaveProperty("service", "smartponto-api");
      expect(typeof res.now).toBe("string");
    });
  });
});