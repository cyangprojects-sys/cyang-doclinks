import { redirect } from "next/navigation";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();
    const email = session?.user?.email || null;

    if (!email) redirect("/");

    // Owner-only guard (matches your new admin model)
    const owner = (process.env.OWNER_EMAIL || "").toLowerCase();
    if (!owner) throw new Error("Missing OWNER_EMAIL");
    if (email.toLowerCase() !== owner) redirect("/");

    return <>{children}</>;
}

