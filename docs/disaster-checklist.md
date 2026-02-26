# Disaster Checklist

Last updated: February 26, 2026

## DB compromise
- [ ] Rotate database credentials.
- [ ] Restore to known-good timestamp in isolated branch.
- [ ] Validate data integrity and audit trail continuity.
- [ ] Cut over and invalidate stale app connections.

## R2 key compromise
- [ ] Rotate R2 API keys immediately.
- [ ] Audit recent object mutations and access patterns.
- [ ] Revoke suspicious shares and force new access tickets.
- [ ] Run scan queue for affected docs.

## Encryption key compromise
- [ ] Revoke compromised key.
- [ ] Set new active key.
- [ ] Run async key rotation jobs until complete.
- [ ] Confirm no docs remain on compromised key version.

## Admin account breach
- [ ] Force sign-out and reset credentials.
- [ ] Review admin actions in immutable audit log.
- [ ] Revert malicious changes (share revoke/disable/restore as needed).
- [ ] Notify stakeholders and document timeline.
