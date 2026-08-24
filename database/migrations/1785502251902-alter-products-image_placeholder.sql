-- Hand-written, not generated.
--
-- `buddy migrate:regenerate` rewrites and renumbers the whole directory from
-- the models, which is right for a schema nobody has run yet and wrong here:
-- production has already applied these 258 files, and re-running an
-- `ALTER TABLE ... ADD COLUMN` is an error rather than a no-op. One additive
-- statement is the whole change.
ALTER TABLE "products" ADD COLUMN "image_placeholder" TEXT default '';
