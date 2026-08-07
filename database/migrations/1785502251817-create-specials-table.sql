CREATE TABLE IF NOT EXISTS "specials" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "day_of_week" INTEGER not null,
  "day_label" TEXT not null,
  "title" TEXT not null,
  "offer" TEXT not null,
  "brands" TEXT,
  "store_slug" TEXT default '',
  "is_active" INTEGER default 1,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "specials_uuid_unique" ON "specials" ("uuid");
