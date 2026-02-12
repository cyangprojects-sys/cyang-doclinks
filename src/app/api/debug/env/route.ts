export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function present(name: string) {
    return Boolean(process.env[name]);
}

export async function GET() {
    return Response.json({
        ok: true,

        // Only booleans (no secret values)
        has: {
            DATABASE_URL: present("DATABASE_URL"),

            R2_ENDPOINT: present("R2_ENDPOINT"),
            R2_ACCESS_KEY_ID: present("R2_ACCESS_KEY_ID"),
            R2_SECRET_ACCESS_KEY: present("R2_SECRET_ACCESS_KEY"),
            R2_BUCKET: present("R2_BUCKET"),
            R2_PREFIX: present("R2_PREFIX"),

            GOOGLE_CLIENT_ID: present("GOOGLE_CLIENT_ID"),
            GOOGLE_CLIENT_SECRET: present("GOOGLE_CLIENT_SECRET"),
            OWNER_EMAILS: present("OWNER_EMAILS"),
            OWNER_EMAIL: present("OWNER_EMAIL"),

            NEXT_PUBLIC_APP_URL: present("NEXT_PUBLIC_APP_URL"),
        },

        // Non-sensitive deployment metadata
        vercel: {
            env: process.env.VERCEL_ENV ?? null,
            commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        },
    });
}

