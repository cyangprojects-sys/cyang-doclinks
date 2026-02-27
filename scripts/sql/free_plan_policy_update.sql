-- Enforce canonical Free plan policy values.
-- Safe to run multiple times.

update public.plans
set
  name = 'Free',
  max_views_per_month = 100,
  max_active_shares = 3,
  max_storage_bytes = 104857600,  -- 100 MB
  max_uploads_per_day = 10,
  max_file_size_bytes = 10485760, -- 10 MB
  allow_custom_expiration = false,
  allow_audit_export = false,
  updated_at = now()
where id = 'free';
