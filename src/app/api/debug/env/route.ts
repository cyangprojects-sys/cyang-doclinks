export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    return Response.json({
        R2_BUCKET: process.env.R2_BUCKET ?? null,
        R2_PREFIX: process.env.R2_PREFIX ?? null,
    });
}
