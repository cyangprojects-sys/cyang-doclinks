// src/app/admin/upload/page.tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AdminUploadClient from "./AdminUploadClient";

export default async function AdminUploadPage() {
    const session = await auth();

    // Not signed in
    if (!session?.user?.email) redirect("/login");

    // Signed in but not owner
    const ownerEmail = (process.env.OWNER_EMAIL || "").toLowerCase().trim();
    const email = session.user.email.toLowerCase().trim();
    if (!ownerEmail || email !== ownerEmail) redirect("/login");

    return <AdminUploadClient />;
}
