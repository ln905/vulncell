-- AlterTable: cột reputation denormalized (nguồn sự thật vẫn là ReputationLedger)
ALTER TABLE "User" ADD COLUMN     "reputation" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "User_reputation_idx" ON "User"("reputation");

-- ============================================================================
-- TỐI ƯU HIỆU NĂNG (chặng 4 / mốc v2)
-- ============================================================================

-- 1) Backfill reputation từ ledger (1 lần)
UPDATE "User" u
SET "reputation" = COALESCE((
  SELECT SUM(l."points") FROM "ReputationLedger" l WHERE l."userId" = u.id
), 0);

-- 2) pg_trgm + GIN index cho tìm kiếm text (ILIKE '%...%' không dùng được btree)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Report_weakness_trgm_idx"         ON "Report" USING gin ("weakness" gin_trgm_ops);
CREATE INDEX "Report_shortDescription_trgm_idx" ON "Report" USING gin ("shortDescription" gin_trgm_ops);
CREATE INDEX "Report_target_trgm_idx"           ON "Report" USING gin ("target" gin_trgm_ops);

-- 3) Composite index cho các truy vấn lọc + sắp xếp thường gặp
CREATE INDEX "Report_state_createdAt_idx"    ON "Report" ("state", "createdAt");
CREATE INDEX "Report_severity_createdAt_idx" ON "Report" ("severity", "createdAt");
CREATE INDEX "Report_reporterId_createdAt_idx" ON "Report" ("reporterId", "createdAt");

-- 4) Thống kê cho query planner
ANALYZE "User";
ANALYZE "Report";
ANALYZE "ReputationLedger";
