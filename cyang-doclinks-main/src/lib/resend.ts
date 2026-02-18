if (!process.env.RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");
if (!process.env.EMAIL_FROM) throw new Error("Missing EMAIL_FROM");

export async function sendSignInEmail(to: string, signInUrl: string) {
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
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      // Optional but often helpful for auth links:
      "X-Entity-Ref-ID": `signin-${Date.now()}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM, // "DocLinks <login@cyang.io>"
      to,
      subject,
      text,
      html,
      // Optional but can help reduce “no-reply” spam scoring:
      reply_to: process.env.EMAIL_FROM,
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

