-- Read-only checks to run before applying the production V1 schema contract.
-- Any non-zero row_count below should be fixed or intentionally removed before
-- running supabase/bootstrap.sql or `pnpm --filter @workspace/db run push`.

SELECT
  'venues_missing_owner_email' AS check_name,
  COUNT(*) AS row_count
FROM venues
WHERE owner_email IS NULL OR btrim(owner_email) = '';

SELECT
  'couple_sessions_missing_couple_email' AS check_name,
  COUNT(*) AS row_count
FROM couple_sessions
WHERE couple_email IS NULL OR btrim(couple_email) = '';

SELECT
  'couple_sessions_missing_share_token' AS check_name,
  COUNT(*) AS row_count
FROM couple_sessions
WHERE share_token IS NULL OR btrim(share_token) = '';

SELECT
  'duplicate_generated_asset_object_keys' AS check_name,
  COUNT(*) AS row_count
FROM (
  SELECT object_key
  FROM generated_assets
  GROUP BY object_key
  HAVING COUNT(*) > 1
) duplicates;

SELECT
  'duplicate_generated_asset_session_slots' AS check_name,
  COUNT(*) AS row_count
FROM (
  SELECT session_id, asset_type, display_order
  FROM generated_assets
  GROUP BY session_id, asset_type, display_order
  HAVING COUNT(*) > 1
) duplicates;

SELECT
  'duplicate_upload_intent_object_keys' AS check_name,
  COUNT(*) AS row_count
FROM (
  SELECT object_key
  FROM upload_intents
  GROUP BY object_key
  HAVING COUNT(*) > 1
) duplicates;

SELECT
  'duplicate_venue_media_object_keys_per_venue' AS check_name,
  COUNT(*) AS row_count
FROM (
  SELECT venue_id, object_key
  FROM venue_media
  GROUP BY venue_id, object_key
  HAVING COUNT(*) > 1
) duplicates;

SELECT
  'venue_media_missing_or_invalid_coverage' AS check_name,
  COUNT(*) AS row_count
FROM venue_media
WHERE coverage IS NULL
   OR coverage NOT IN ('exterior', 'ceremony', 'reception', 'detail', 'natural_light');

SELECT
  'venues_missing_required_media_coverage' AS check_name,
  COUNT(*) AS row_count
FROM venues v
WHERE EXISTS (
  SELECT 1
  FROM unnest(ARRAY['exterior', 'ceremony', 'reception', 'detail', 'natural_light']) AS required_coverage(coverage)
  WHERE NOT EXISTS (
    SELECT 1
    FROM venue_media vm
    WHERE vm.venue_id = v.id
      AND vm.coverage = required_coverage.coverage
  )
);

-- --- veil bridal subsystem readiness (added by the port) ---

SELECT
  'dresses_missing_sku' AS check_name,
  COUNT(*) AS row_count
FROM dresses
WHERE sku IS NULL OR btrim(sku) = '';

SELECT
  'dresses_missing_style_name' AS check_name,
  COUNT(*) AS row_count
FROM dresses
WHERE style_name IS NULL OR btrim(style_name) = '';

SELECT
  'dresses_invalid_status' AS check_name,
  COUNT(*) AS row_count
FROM dresses
WHERE status IS NULL
   OR status NOT IN ('in_stock', 'special_order', 'discontinued');

SELECT
  'duplicate_dress_skus_per_org' AS check_name,
  COUNT(*) AS row_count
FROM (
  SELECT organization_id, sku
  FROM dresses
  GROUP BY organization_id, sku
  HAVING COUNT(*) > 1
) duplicates;

SELECT
  'dress_media_missing_or_invalid_coverage' AS check_name,
  COUNT(*) AS row_count
FROM dress_media
WHERE coverage IS NULL
   OR coverage NOT IN ('front', 'back', 'detail', 'fabric', 'on_model');

SELECT
  'duplicate_dress_media_object_keys_per_dress' AS check_name,
  COUNT(*) AS row_count
FROM (
  SELECT dress_id, object_key
  FROM dress_media
  GROUP BY dress_id, object_key
  HAVING COUNT(*) > 1
) duplicates;

-- A dress is not try-on ready without a validated `front` image; surface any
-- in-stock dress that has no front coverage so onboarding can close the gap.
SELECT
  'in_stock_dresses_missing_front_coverage' AS check_name,
  COUNT(*) AS row_count
FROM dresses d
WHERE d.status = 'in_stock'
  AND NOT EXISTS (
    SELECT 1 FROM dress_media dm
    WHERE dm.dress_id = d.id AND dm.coverage = 'front'
  );

SELECT
  'lookbooks_missing_credit_cap' AS check_name,
  COUNT(*) AS row_count
FROM lookbooks
WHERE credit_cap IS NULL;

SELECT
  'lookbooks_missing_expiry' AS check_name,
  COUNT(*) AS row_count
FROM lookbooks
WHERE expires_at IS NULL;

SELECT
  'lookbooks_missing_token' AS check_name,
  COUNT(*) AS row_count
FROM lookbooks
WHERE token IS NULL OR btrim(token) = '';

SELECT
  'duplicate_reaction_votes_per_asset' AS check_name,
  COUNT(*) AS row_count
FROM (
  SELECT generated_asset_id, voter_token
  FROM reactions
  GROUP BY generated_asset_id, voter_token
  HAVING COUNT(*) > 1
) duplicates;

SELECT
  'consent_records_missing_subject' AS check_name,
  COUNT(*) AS row_count
FROM consent_records
WHERE subject_email IS NULL OR btrim(subject_email) = '';
