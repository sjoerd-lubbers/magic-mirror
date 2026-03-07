INSERT INTO "MirrorModule" ("id", "mirrorId", "type", "enabled", "config", "createdAt", "updatedAt")
SELECT
  lower(hex(randomblob(16))),
  "id",
  'TODOIST',
  0,
  '{"projectId":"","maxVisible":8,"pollSeconds":30,"layout":{"x":1,"y":10,"w":12,"h":3}}',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Mirror"
WHERE NOT EXISTS (
  SELECT 1
  FROM "MirrorModule"
  WHERE "MirrorModule"."mirrorId" = "Mirror"."id"
    AND "MirrorModule"."type" = 'TODOIST'
);
