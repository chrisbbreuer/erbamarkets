CREATE TABLE IF NOT EXISTS "stores" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT not null,
  "slug" TEXT not null,
  "short_name" TEXT not null,
  "address_line" TEXT not null,
  "city" TEXT default 'Los Angeles',
  "state" TEXT default 'CA',
  "postal_code" TEXT,
  "store_phone" TEXT,
  "delivery_phone" TEXT,
  "email" TEXT,
  "license_number" TEXT,
  "store_hours" TEXT,
  "delivery_hours" TEXT,
  "pickup_hours" TEXT,
  "amenities" TEXT,
  "map_url" TEXT,
  "image_url" TEXT,
  "delivery_minimum" INTEGER default 30,
  "display_order" INTEGER default 1,
  "is_active" INTEGER default 1,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "stores_slug_unique" ON "stores" ("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "stores_uuid_unique" ON "stores" ("uuid");
