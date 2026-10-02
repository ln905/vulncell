-- CreateEnum
CREATE TYPE "Role" AS ENUM ('HACKER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ReportState" AS ENUM ('NONE', 'PENDING', 'TRIAGED', 'RESOLVED', 'DUPLICATE', 'INFORMATIVE', 'NOT_APPLICABLE', 'SPAM');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('SUBMITTED', 'COMMENT', 'STATE_CHANGE', 'BOUNTY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'HACKER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "weakness" TEXT NOT NULL,
    "cveId" TEXT,
    "shortDescription" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'NONE',
    "state" "ReportState" NOT NULL DEFAULT 'NONE',
    "bounty" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disclosedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportEvent" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "content" TEXT,
    "fromState" "ReportState",
    "toState" "ReportState",
    "bountyAmount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReputationLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReputationLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Report_state_idx" ON "Report"("state");

-- CreateIndex
CREATE INDEX "Report_weakness_idx" ON "Report"("weakness");

-- CreateIndex
CREATE INDEX "Report_createdAt_idx" ON "Report"("createdAt");

-- CreateIndex
CREATE INDEX "ReportEvent_reportId_idx" ON "ReportEvent"("reportId");

-- CreateIndex
CREATE INDEX "ReputationLedger_userId_createdAt_idx" ON "ReputationLedger"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportEvent" ADD CONSTRAINT "ReportEvent_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportEvent" ADD CONSTRAINT "ReportEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationLedger" ADD CONSTRAINT "ReputationLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
