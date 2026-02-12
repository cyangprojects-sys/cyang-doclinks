import DirectUploadClient from "./upload-client";

export const dynamic = "force-dynamic";

export default function AdminUploadPage() {
    return (
        <main style={{ maxWidth: 860, margin: "0 auto", padding: 24 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Admin Upload</h1>
            <p style={{ opacity: 0.8, marginBottom: 16 }}>
                Uploads go directly to R2 via a signed URL. Only the owner can use this page.
            </p>

            <DirectUploadClient />
        </main>
    );
}
