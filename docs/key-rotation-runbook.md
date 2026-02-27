# Key Rotation Runbook

This runbook is for production key rotation using `DOC_MASTER_KEYS` and the owner Security UI.

## Preconditions

1. Confirm `DOC_MASTER_KEYS` contains at least two keys and one key has `"active": true`.
2. Confirm `scripts/sql/key_rotation_ops.sql` has been applied.
3. Confirm Cloudflare cron for `TARGET_KEY_ROTATION_URL` is active.
4. Confirm queue health in **Admin > Security**:
   - Rotation jobs not stuck in `running`
   - Scan dead-letter backlog is not growing

## Procedure

1. Add new key to `DOC_MASTER_KEYS` in production env.
2. Deploy with updated env.
3. Open **Admin > Security** and click **Refresh** in Master key operations.
4. In **Active key switch**, select new key and set reason.
5. Click **Set Active Key**.
6. In **Re-encryption job queue**, set:
   - `FROM` = previous active key
   - `TO` = new active key
   - batch size (start with `250`)
7. Click **Enqueue Rotation Job**.
8. Monitor **Rotation jobs** until status is `completed`.
9. Run SQL validation:
   - `select count(*) from public.docs where coalesce(enc_key_version,'') = '<old-key-id>';`
10. When count is `0`, optionally revoke old key.

## Rollback

1. In **Recent key changes**, use **Rollback** on latest change.
2. Re-run step 9 to confirm docs are readable and key version converges.
3. Investigate failed jobs, then requeue with smaller batch size.

## Failure Conditions

- If decrypt failures spike, pause rotation and rollback active key.
- If job failures increase, inspect `last_error` and R2/DB health first.
- Do not revoke old key until rotated-doc count is verified as zero.

