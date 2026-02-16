// src/app/d/[alias]/actions.types.ts
import { z } from "zod";

export const CreateSchema = z.object({
    doc_id: z.string().uuid().optional(),
    alias: z.string().min(1).optional(),
    to_email: z.string().email().optional(),
    expires_in_hours: z.number().int().positive().max(24 * 365).optional(),
    max_views: z.number().int().positive().max(1_000_000).optional(),
});

export type CreateShareResult =
    | {
        ok: true;
        token: string;
        doc_id: string;
        to_email: string | null;
        share_url: string;
        created_at: string;
        expires_at: string | null;
        max_views: number | null;
    }
    | { ok: false; error: string; message?: string };

export type ShareStatsResult =
    | {
        ok: true;
        token: string;
        doc_id: string;
        to_email: string | null;
        created_at: string;
        expires_at: string | null;
        max_views: number | null;
        view_count: number;
        revoked_at: string | null;
        has_password: boolean;
    }
    | { ok: false; error: string; message?: string };

export type RevokeShareResult =
    | { ok: true; token: string; revoked_at: string }
    | { ok: false; error: string; message?: string };
