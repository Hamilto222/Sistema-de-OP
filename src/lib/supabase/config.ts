import { z } from "zod";

const schema = z.object({
  url: z.url(),
  key: z.string().min(1),
});

export function getSupabaseConfig() {
  const result = schema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!result.success) throw new Error("Configure a URL e a chave publicável do Supabase em .env.local.");
  return result.data;
}

export function isSupabaseConfigured() {
  return schema.safeParse({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }).success;
}
