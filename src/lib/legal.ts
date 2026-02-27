function normEmail(v: string | undefined): string | null {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

export function getSupportEmail(): string {
  return (
    normEmail(process.env.SUPPORT_EMAIL) ||
    normEmail(process.env.CONTACT_EMAIL) ||
    "support@cyang.io"
  );
}

export function getDmcaEmail(): string {
  return (
    normEmail(process.env.DMCA_EMAIL) ||
    normEmail(process.env.DMCA_CONTACT_EMAIL) ||
    getSupportEmail()
  );
}

export function getPrivacyEmail(): string {
  return normEmail(process.env.PRIVACY_EMAIL) || getSupportEmail();
}

export function getSecurityEmail(): string {
  return (
    normEmail(process.env.SECURITY_EMAIL) ||
    normEmail(process.env.RESPONSIBLE_DISCLOSURE_EMAIL) ||
    getSupportEmail()
  );
}
