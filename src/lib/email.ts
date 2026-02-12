import nodemailer from "nodemailer";

function required(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
}

export async function sendMail(opts: {
    to: string;
    subject: string;
    text: string;
    html?: string;
}) {
    const host = required("SMTP_HOST");
    const port = parseInt(required("SMTP_PORT"), 10);
    const user = required("SMTP_USER");
    const pass = required("SMTP_PASS");
    const from = required("EMAIL_FROM");

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });

    await transporter.sendMail({
        from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
    });
}
