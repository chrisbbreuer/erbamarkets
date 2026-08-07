PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE "_qb_tmp_products" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT not null,
  "slug" TEXT not null,
  "description" TEXT,
  "price" INTEGER not null,
  "compare_at_price" INTEGER default 0,
  "unit_size" TEXT,
  "strain_type" TEXT CHECK ("strain_type" IN ('indica', 'sativa', 'hybrid', 'cbd')) default 'hybrid',
  "thc_percentage" INTEGER default 0,
  "cbd_percentage" INTEGER default 0,
  "brand_line" TEXT,
  "image_url" TEXT,
  "rating" INTEGER default 0,
  "review_count" INTEGER default 0,
  "is_featured" INTEGER default 0,
  "is_available" INTEGER default 1,
  "inventory_count" INTEGER,
  "preparation_time" INTEGER not null default 15,
  "allergens" TEXT,
  "nutritional_info" TEXT,
  "category_id" INTEGER REFERENCES "categories"("id"),
  "manufacturer_id" INTEGER REFERENCES "manufacturers"("id"),
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);
INSERT INTO "_qb_tmp_products" ("id", "name", "description", "price", "image_url", "is_available", "inventory_count", "preparation_time", "allergens", "nutritional_info", "category_id", "manufacturer_id", "created_at", "updated_at", "uuid") SELECT "id", "name", "description", "price", "image_url", "is_available", "inventory_count", "preparation_time", "allergens", "nutritional_info", "category_id", "manufacturer_id", "created_at", "updated_at", "uuid" FROM "products";
DROP TABLE "products";
ALTER TABLE "_qb_tmp_products" RENAME TO "products";
CREATE UNIQUE INDEX IF NOT EXISTS "products_slug_unique" ON "products" ("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "products_uuid_unique" ON "products" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "products_products_uuid_unique" ON "products" ("uuid");
PRAGMA foreign_key_check;
COMMIT;
PRAGMA foreign_keys=ON;
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE "_qb_tmp_teams" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT not null,
  "description" TEXT,
  "member_count" INTEGER default 0,
  "status" TEXT,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);
INSERT INTO "_qb_tmp_teams" ("id", "name", "description", "member_count", "status", "created_at", "updated_at", "uuid") SELECT "id", "name", "description", "member_count", "status", "created_at", "updated_at", "uuid" FROM "teams";
DROP TABLE "teams";
ALTER TABLE "_qb_tmp_teams" RENAME TO "teams";
CREATE UNIQUE INDEX IF NOT EXISTS "teams_name_unique" ON "teams" ("name");
CREATE UNIQUE INDEX IF NOT EXISTS "teams_uuid_unique" ON "teams" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "teams_teams_uuid_unique" ON "teams" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "teams_teams_name_unique" ON "teams" ("name");
PRAGMA foreign_key_check;
COMMIT;
PRAGMA foreign_keys=ON;
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE "_qb_tmp_team_invitations" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "team_id" INTEGER not null REFERENCES "teams"("id"),
  "email" TEXT not null,
  "role" TEXT CHECK ("role" IN ('admin', 'member', 'viewer')) not null default 'member',
  "token_hash" TEXT not null,
  "invited_by_user_id" INTEGER,
  "accepted_by_user_id" INTEGER,
  "status" TEXT CHECK ("status" IN ('pending', 'accepted', 'revoked', 'expired')) not null default 'pending',
  "delivery_status" TEXT CHECK ("delivery_status" IN ('pending', 'sent', 'failed')) not null default 'pending',
  "delivery_error" TEXT,
  "expires_at" TEXT not null,
  "delivered_at" TEXT,
  "accepted_at" TEXT,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);
INSERT INTO "_qb_tmp_team_invitations" ("id", "team_id", "email", "role", "token_hash", "invited_by_user_id", "accepted_by_user_id", "status", "delivery_status", "delivery_error", "expires_at", "delivered_at", "accepted_at", "created_at", "updated_at", "uuid") SELECT "id", "team_id", "email", "role", "token_hash", "invited_by_user_id", "accepted_by_user_id", "status", "delivery_status", "delivery_error", "expires_at", "delivered_at", "accepted_at", "created_at", "updated_at", "uuid" FROM "team_invitations";
DROP TABLE "team_invitations";
ALTER TABLE "_qb_tmp_team_invitations" RENAME TO "team_invitations";
CREATE UNIQUE INDEX IF NOT EXISTS "team_invitations_token_hash_unique" ON "team_invitations" ("token_hash");
CREATE INDEX IF NOT EXISTS "team_invitations_team_email_status_index" ON "team_invitations" ("team_id", "email", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "team_invitations_uuid_unique" ON "team_invitations" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "team_invitations_team_invitations_uuid_unique" ON "team_invitations" ("uuid");
CREATE INDEX IF NOT EXISTS "team_invitations_team_invitations_team_email_status_index" ON "team_invitations" ("team_id", "email", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "team_invitations_team_invitations_token_hash_unique" ON "team_invitations" ("token_hash");
PRAGMA foreign_key_check;
COMMIT;
PRAGMA foreign_keys=ON;
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE "_qb_tmp_users" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT not null,
  "email" TEXT not null,
  "password" TEXT not null,
  "avatar" TEXT,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT,
  "email_verified_at" TEXT,
  "password_changed_at" TEXT,
  "two_factor_secret" TEXT,
  "two_factor_enabled" INTEGER not null default '0',
  "two_factor_last_used_step" INTEGER,
  "stripe_id" TEXT
);
INSERT INTO "_qb_tmp_users" ("id", "name", "email", "password", "avatar", "created_at", "updated_at", "uuid", "email_verified_at", "password_changed_at", "two_factor_secret", "two_factor_enabled", "two_factor_last_used_step", "stripe_id") SELECT "id", "name", "email", "password", "avatar", "created_at", "updated_at", "uuid", "email_verified_at", "password_changed_at", "two_factor_secret", "two_factor_enabled", "two_factor_last_used_step", "stripe_id" FROM "users";
DROP TABLE "users";
ALTER TABLE "_qb_tmp_users" RENAME TO "users";
CREATE INDEX IF NOT EXISTS "users_email_name_index" ON "users" ("email", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" ("email");
CREATE UNIQUE INDEX IF NOT EXISTS "users_uuid_unique" ON "users" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "users_idx_users_stripe_id" ON "users" ("stripe_id");
CREATE UNIQUE INDEX IF NOT EXISTS "users_users_email_unique" ON "users" ("email");
CREATE INDEX IF NOT EXISTS "users_users_email_name_index" ON "users" ("email", "name");
PRAGMA foreign_key_check;
COMMIT;
PRAGMA foreign_keys=ON;
