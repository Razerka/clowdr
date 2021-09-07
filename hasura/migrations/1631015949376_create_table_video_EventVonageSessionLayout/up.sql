CREATE TABLE "video"."EventVonageSessionLayout" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "layoutData" jsonb NOT NULL, "eventVonageSessionId" uuid NOT NULL, PRIMARY KEY ("id") , FOREIGN KEY ("eventVonageSessionId") REFERENCES "video"."EventVonageSession"("id") ON UPDATE cascade ON DELETE cascade);
CREATE OR REPLACE FUNCTION "video"."set_current_timestamp_updated_at"()
RETURNS TRIGGER AS $$
DECLARE
  _new record;
BEGIN
  _new := NEW;
  _new."updated_at" = NOW();
  RETURN _new;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "set_video_EventVonageSessionLayout_updated_at"
BEFORE UPDATE ON "video"."EventVonageSessionLayout"
FOR EACH ROW
EXECUTE PROCEDURE "video"."set_current_timestamp_updated_at"();
COMMENT ON TRIGGER "set_video_EventVonageSessionLayout_updated_at" ON "video"."EventVonageSessionLayout" 
IS 'trigger to set value of column "updated_at" to current timestamp on row update';
CREATE EXTENSION IF NOT EXISTS pgcrypto;
