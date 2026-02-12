import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = (await getServerSession(authOptions)) as any;
    const email = (session?.user?.email as string | undefined) ?? null;

    // Not signed in → go sign in
    if (!email) redirect("/api/auth/signin");

    const owner = (process.env.OWNER_EMAIL || "").toLowerCase();

    // Missing env or not the owner → go home (no crash)
    if (!owner || email.toLowerCase() !== owner) redirect("/");

    return <>{children}</>;
}
