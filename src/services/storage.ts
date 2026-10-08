import "server-only";
import { z } from "zod";
import { requireActiveProfile } from "@/lib/auth/session";

const requestSchema = z.object({
  bucket: z.enum(["op-originals", "quality-evidence", "operator-evidence", "final-reports"]),
  path: z.string().regex(/^[0-9a-fA-F-]{36}\/[^/].+$/),
});

// User-scoped client: Storage policies enforce OP access, including for signed URLs.
// App-issued URLs expire in 60s; do not persist/log them. Existing bearer links
// remain valid until expiry; authorized direct Storage API callers choose their TTL.
export async function createDocumentUrl(bucket: string, path: string) {
  const input = requestSchema.parse({ bucket, path });
  const { supabase } = await requireActiveProfile();
  const { data, error } = await supabase.storage.from(input.bucket).createSignedUrl(input.path, 60);
  if (error) throw new Error("Documento indisponível ou acesso não autorizado.");
  return data.signedUrl;
}
