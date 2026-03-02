import { createHash } from "node:crypto";

export function hashIp(ip: string | null | undefined) {
    if (!ip) return null;
    const salt = process.env.VIEW_SALT || "dev-salt-change-me";
    return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export function getClientIp(req: Request) {
    const cf = (req.headers.get("cf-connecting-ip") || "").trim();
    if (cf) return cf;

    // Vercel/common proxy chain: client, proxy1, proxy2...
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) {
        const first = fwd.split(",")[0]?.trim();
        if (first) return first;
    }

    const vercel = req.headers.get("x-vercel-forwarded-for");
    if (vercel) {
        const first = vercel.split(",")[0]?.trim();
        if (first) return first;
    }

    const real = (req.headers.get("x-real-ip") || "").trim();
    return real || null;
}
