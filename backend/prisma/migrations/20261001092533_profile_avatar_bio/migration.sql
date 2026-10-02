-- DropIndex
DROP INDEX "Report_reporterId_createdAt_idx";

-- DropIndex
DROP INDEX "Report_severity_createdAt_idx";

-- DropIndex
DROP INDEX "Report_shortDescription_trgm_idx";

-- DropIndex
DROP INDEX "Report_state_createdAt_idx";

-- DropIndex
DROP INDEX "Report_target_trgm_idx";

-- DropIndex
DROP INDEX "Report_weakness_trgm_idx";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "bio" VARCHAR(160);
