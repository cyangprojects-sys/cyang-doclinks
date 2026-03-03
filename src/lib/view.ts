import { createHash } from "node:crypto";
import { getTrustedClientIpFromHeaders } from "@/lib/clientIp";

export function hashIp(ip: string | null | undefined) {
    if (!ip) return null;
    const salt = process.env.VIEW_SALT || "dev-salt-change-me";
    return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export function getClientIp(req: Request) {
    return getTrustedClientIpFromHeaders(req.headers);
}
