-- Repair drift in "Worksite" without reset (safe / supports quoted table name)

-- 1) ensure requireSelfie exists (if not, add with default true)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'Worksite'
      AND column_name  = 'requireSelfie'
  ) THEN
    ALTER TABLE "Worksite"
      ADD COLUMN "requireSelfie" boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- 2) align updatedAt default (drop DB default if present)
DO $$
BEGIN
  BEGIN
    ALTER TABLE "Worksite" ALTER COLUMN "updatedAt" DROP DEFAULT;
  EXCEPTION WHEN others THEN
    NULL;
  END;
END $$;

-- 3) add FK Worksite.tenantId -> Tenant.id if missing
DO $$
DECLARE
  orphan_count int;
  ws regclass;
BEGIN
  ws := to_regclass('"public"."Worksite"');
  IF ws IS NULL THEN
    RAISE EXCEPTION 'Table "public"."Worksite" not found';
  END IF;

  SELECT count(*) INTO orphan_count
  FROM "Worksite" w
  LEFT JOIN "Tenant" t ON t."id" = w."tenantId"
  WHERE w."tenantId" IS NOT NULL
    AND t."id" IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Cannot add FK Worksite.tenantId -> Tenant.id: % orphan rows', orphan_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = ws
      AND contype = 'f'
      AND conname = 'Worksite_tenantId_fkey'
  ) THEN
    ALTER TABLE "Worksite"
      ADD CONSTRAINT "Worksite_tenantId_fkey"
      FOREIGN KEY ("tenantId")
      REFERENCES "Tenant"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
