// src/app/admin/layout.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
