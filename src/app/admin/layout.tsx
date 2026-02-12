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
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;

    if (!email) redirect("/");

    return (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>Admin</div>
                <div style={{ opacity: 0.7, marginTop: 4 }}>Signed in as {email}</div>
            </div>
            {children}
        </div>
    );
}

