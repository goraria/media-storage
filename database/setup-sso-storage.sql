-- Trusted operator registration only. Keys are NOT supplied to this SQL file.
-- psql -v bucket_name='...' -v s3_endpoint='https://...' -v s3_region='...'
--      -v credentials_url='https://auth.example/internal/storage/credential'
--      -f database/setup-sso-storage.sql
BEGIN;
INSERT INTO media_storage_profile (application, bucket_name, endpoint, region, credentials_url)
VALUES ('sso', :'bucket_name', :'s3_endpoint', :'s3_region', :'credentials_url')
ON CONFLICT (application, bucket_name) DO UPDATE SET
  endpoint = excluded.endpoint, region = excluded.region,
  credentials_url = excluded.credentials_url, enabled = true, updated_at = now();

INSERT INTO media_bucket (application, name, r2_bucket_name, storage_prefix,
  visibility, allowed_types, max_file_size)
VALUES ('sso', 'avatar', :'bucket_name', 'avatar', 'public', ARRAY['image']::media_type[], 2097152)
ON CONFLICT (application, name) DO NOTHING;
SELECT id AS sso_avatar_bucket_id FROM media_bucket WHERE application = 'sso' AND name = 'avatar';
COMMIT;
