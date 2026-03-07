DELETE FROM "MirrorModule"
WHERE "type" = 'MAIL'
  AND "mirrorId" IN (
    SELECT "mirrorId" FROM "MirrorModule" WHERE "type" = 'CALENDAR'
  );

UPDATE "MirrorModule"
SET "type" = 'CALENDAR'
WHERE "type" = 'MAIL';

INSERT INTO "MirrorModule" ("id", "mirrorId", "type", "enabled", "config", "createdAt", "updatedAt")
SELECT
  lower(hex(randomblob(16))),
  "id",
  'CALENDAR',
  1,
  '{"calendarName":"Gezin","daysAhead":8,"maxVisible":8,"showLocation":true,"layout":{"x":9,"y":1,"w":4,"h":3}}',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Mirror"
WHERE NOT EXISTS (
  SELECT 1
  FROM "MirrorModule"
  WHERE "MirrorModule"."mirrorId" = "Mirror"."id"
    AND "MirrorModule"."type" = 'CALENDAR'
);

INSERT INTO "MirrorModule" ("id", "mirrorId", "type", "enabled", "config", "createdAt", "updatedAt")
SELECT
  lower(hex(randomblob(16))),
  "id",
  'ATTENTION',
  1,
  '{"items":[],"layout":{"x":1,"y":7,"w":12,"h":3}}',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Mirror"
WHERE NOT EXISTS (
  SELECT 1
  FROM "MirrorModule"
  WHERE "MirrorModule"."mirrorId" = "Mirror"."id"
    AND "MirrorModule"."type" = 'ATTENTION'
);
