alter table "video"."EventVonageSessionLayout"
  add constraint "EventVonageSessionLayout_conferenceId_fkey"
  foreign key ("conferenceId")
  references "conference"."Conference"
  ("id") on update cascade on delete cascade;
