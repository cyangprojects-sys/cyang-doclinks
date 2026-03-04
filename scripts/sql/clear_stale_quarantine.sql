-- Clear stale quarantine safely
--
-- A doc is considered stale-quarantined when:
-- - moderation_status = 'quarantined'
-- - scan_status = 'clean'
-- - risk_level is not 'high'
-- - DMCA status is not pending/takedown (if column exists)
--
-- 1) Clear one specific doc (replace UUID):
-- update public.docs d
-- set
--   moderation_status = 'active',
--   disabled_at = null,
--   disabled_by = null,
--   disabled_reason = null
-- where d.id = '00000000-0000-0000-0000-000000000000'::uuid
--   and lower(coalesce(d.moderation_status, 'active')) = 'quarantined'
--   and lower(coalesce(d.scan_status, 'unscanned')) = 'clean'
--   and lower(coalesce(d.risk_level, 'low')) <> 'high'
--   and lower(coalesce(to_jsonb(d)->>'dmca_status', 'none')) not in ('pending', 'takedown');

-- 2) Clear all stale-quarantined docs:
update public.docs d
set
  moderation_status = 'active',
  disabled_at = null,
  disabled_by = null,
  disabled_reason = null
where lower(coalesce(d.moderation_status, 'active')) = 'quarantined'
  and lower(coalesce(d.scan_status, 'unscanned')) = 'clean'
  and lower(coalesce(d.risk_level, 'low')) <> 'high'
  and lower(coalesce(to_jsonb(d)->>'dmca_status', 'none')) not in ('pending', 'takedown');
