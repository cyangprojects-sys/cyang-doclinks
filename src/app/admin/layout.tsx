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

    if (!email) redirect("/");

    const owner = (process.env.OWNER_EMAIL || "").toLowerCase();
    if (!owner) throw new Error("Missing OWNER_EMAIL");
    if (email.toLowerCase() !== owner) redirect("/");

    return <>{children}</>;
}
