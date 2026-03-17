import ViewerDocDetailPage from "../../docs/[docId]/page";

export const runtime = "nodejs";

export default async function ViewerDocumentDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }> | { documentId: string };
}) {
  const resolved = await Promise.resolve(params);
  return <ViewerDocDetailPage params={{ docId: resolved.documentId }} />;
}
