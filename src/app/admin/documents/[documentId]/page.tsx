import LegacyDocumentDetailPage from "../../docs/[docId]/page";

export const runtime = "nodejs";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }> | { documentId: string };
}) {
  const resolved = await Promise.resolve(params);
  return <LegacyDocumentDetailPage params={{ docId: resolved.documentId }} />;
}
