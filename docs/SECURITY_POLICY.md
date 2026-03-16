# Security Policy
Effective Date: March 01, 2026
Last Updated: March 16, 2026

This Security Policy describes the controls and operating principles used by cyang.io and Doclinks to protect customer data, preserve access boundaries, and support reliable delivery workflows.

## 1. Security Philosophy
Security is designed into service behavior, not treated as optional user behavior. Controls are enforced server-side wherever possible.

## 2. Shared Responsibility
cyang.io secures the underlying platform, delivery controls, and operational monitoring.

Customers are responsible for:

- choosing appropriate recipients,
- protecting their account credentials,
- classifying content before upload,
- configuring policy controls for business risk.

## 3. Encryption in Transit
Traffic between clients and service endpoints is protected using TLS.

## 4. Document Protection and Storage
Documents are stored through encrypted handling workflows. We do not provide an intentional unencrypted delivery path for production service operations.

## 5. Access Controls and Authentication
Security measures include:

- authenticated administration surfaces,
- role and scope boundaries,
- policy-enforced share access controls,
- ability to revoke and expire access links.

## 6. Enforcement-Centered Delivery Controls
Doclinks supports controlled delivery settings such as:

- expiration windows,
- max-view constraints,
- revocation,
- optional download controls,
- quarantine-aware serving states.

## 7. Malware and Quarantine Workflow
Files are evaluated by scan and state checks before public delivery. Risky states may result in blocked or quarantined delivery pending review.

## 8. Logging, Monitoring, and Auditability
Operational and security events are logged for abuse investigation, incident response, and policy enforcement.

Logs are designed to support review without exposing unnecessary sensitive payloads.

## 9. Rate Limiting and Abuse Protection
The service uses request controls and abuse throttling to reduce brute-force behavior, token guessing attempts, and infrastructure stress.

## 10. Vulnerability Management
We review vulnerabilities based on severity and exploitability.

Response actions may include:

- mitigation controls,
- patch deployment,
- temporary feature restrictions,
- incident communication where customer impact is material.

## 11. Incident Response
When a confirmed security incident occurs, we follow an incident process that includes triage, containment, remediation, and post-incident review.

Where required, affected customers are notified in accordance with applicable law and contractual obligations.

## 12. Infrastructure and Third-Party Dependencies
We use third-party infrastructure and service providers as part of platform operations. Vendor selection considers security posture, reliability, and operational fit.

## 13. Responsible Disclosure
Security researchers may report vulnerabilities to security@cyang.io.

Please include:

- impacted endpoint or workflow,
- reproduction steps,
- estimated impact,
- any proof-of-concept details needed for verification.

Do not perform destructive testing, social engineering, or unauthorized access attempts.

## 14. Security Limitations
No platform can guarantee absolute security. This policy describes controls and intent, not a warranty that all incidents can be prevented.

## 15. Security Contact
- security@cyang.io
- legal@cyang.io
