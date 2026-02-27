function requireEnv(name: "RESEND_API_KEY" | "EMAIL_FROM"): string {
  const value = (process.env[name] || "").trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export async function sendSignInEmail(to: string, signInUrl: string) {
  const resendApiKey = requireEnv("RESEND_API_KEY");
  const emailFrom = requireEnv("EMAIL_FROM");
  const subject = "Sign in to view your document";

  const text =
    `Click the link below to sign in and access your document:\n\n` +
    `${signInUrl}\n\n` +
    `This link expires soon and can only be used once.\n`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <p>Click the link below to sign in and access your document:</p>
      <p><a href="${signInUrl}">${signInUrl}</a></p>
      <p style="color:#666;font-size:12px">This link expires soon and can only be used once.</p>
    </div>
  `;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      // Optional but often helpful for auth links:
      "X-Entity-Ref-ID": `signin-${Date.now()}`,
    },
    body: JSON.stringify({
      from: emailFrom, // "DocLinks <login@cyang.io>"
      to,
      subject,
      text,
      html,
      // Optional but can help reduce no-reply spam scoring:
      reply_to: emailFrom,
      headers: {
        // Helps some clients show a single thread per sign-in attempt:
        "X-Auto-Response-Suppress": "All",
      },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Resend error: ${resp.status} ${text}`);
  }
}
