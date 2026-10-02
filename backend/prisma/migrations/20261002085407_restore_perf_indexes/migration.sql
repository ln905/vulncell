-- CreateIndex
CREATE INDEX "Report_state_createdAt_idx" ON "Report"("state", "createdAt");

-- CreateIndex
CREATE INDEX "Report_severity_createdAt_idx" ON "Report"("severity", "createdAt");

-- CreateIndex
CREATE INDEX "Report_reporterId_createdAt_idx" ON "Report"("reporterId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_weakness_trgm_idx" ON "Report" USING GIN ("weakness" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Report_shortDescription_trgm_idx" ON "Report" USING GIN ("shortDescription" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Report_target_trgm_idx" ON "Report" USING GIN ("target" gin_trgm_ops);
