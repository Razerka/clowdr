CREATE INDEX "EventVonageSessionLayout_eventVonageSessionId_createdAt"
    ON video."EventVonageSessionLayout" USING btree
    ("eventVonageSessionId" ASC NULLS LAST, created_at DESC NULLS LAST)
;
