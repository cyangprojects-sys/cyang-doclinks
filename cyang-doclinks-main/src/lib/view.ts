import { createHash } from "node:crypto";

export function hashIp(ip: string | null | undefined) {
    if (!ip) return null;
    const salt = process.env.VIEW_SALT || "dev-salt-change-me";
    return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export function getClientIp(req: Request) {
    // Vercel provides x-forwarded-for with client,proxy chain
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim();
    return req.headers.get("x-real-ip") || null;
}
