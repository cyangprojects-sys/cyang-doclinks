import { cookies } from "next/headers";
import { verifySignedPayload } from "@/lib/crypto";

export type DocSession = {
  grant_id: number;
  exp: number;
};

export async function getDocSessionPage(): Promise<DocSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("cy_doc_session")?.value;
  if (!raw) return null;

  const session = verifySignedPayload(raw) as DocSession | null;
  if (!session) return null;

  const now = Math.floor(Date.now() / 1000);
  if (session.exp <= now) return null;

  return session;
}
