import { existsSync, writeFileSync } from 'node:fs';
import { localConfig } from './local-supabase.mjs';
if (existsSync('.env.local')) throw new Error('.env.local já existe; preserve e revise a configuração atual.');
const config=localConfig();
writeFileSync('.env.local',`# Somente URL e chave pública da instância local; nenhuma chave privilegiada.\nNEXT_PUBLIC_SUPABASE_URL=${config.url}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${config.key}\n`,{mode:0o600});
console.log('.env.local criado com configuração pública do Supabase local.');
