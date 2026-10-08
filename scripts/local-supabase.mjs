import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

export function localConfig() {
  const command = process.env.SUPABASE_CLI || (existsSync('.tools/supabase') ? '.tools/supabase' : 'supabase');
  let result;
  try {
    result = JSON.parse(execFileSync(command, ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch {
    throw new Error('Supabase local indisponível. Execute npm run db:start e confira os serviços.');
  }
  const url = new URL(result.API_URL);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Este comando aceita somente Supabase local.');
  if (!result.SERVICE_ROLE_KEY || !result.ANON_KEY) throw new Error('Supabase local incompleto.');
  return { url: result.API_URL, key: result.ANON_KEY, serviceKey: result.SERVICE_ROLE_KEY };
}
export function localAdmin(config = localConfig()) {
  return createClient(config.url, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function localClient(config = localConfig()) {
  return createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function checked(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
