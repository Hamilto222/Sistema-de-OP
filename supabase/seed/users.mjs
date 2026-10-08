import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { localAdmin, checked } from '../../scripts/local-supabase.mjs';

// Seed identities are development data only; the application never reads this list.
export const demoUsers = [
  { nome: 'Admin Desenvolvimento', email: 'admin@opdigital.example', role: 'ADMIN', production_line_id: null },
  { nome: 'PCP Desenvolvimento', email: 'pcp@opdigital.example', role: 'PCP', production_line_id: null },
  { nome: 'Qualidade Desenvolvimento', email: 'qualidade@opdigital.example', role: 'QUALIDADE', production_line_id: null },
  { nome: 'Operador Linha 1', email: 'operador1@opdigital.example', role: 'OPERADOR', production_line_id: '10000000-0000-4000-8000-000000000001' },
  { nome: 'Operador Linha 2', email: 'operador2@opdigital.example', role: 'OPERADOR', production_line_id: '10000000-0000-4000-8000-000000000002' },
];

export async function seedUsers(password, suffix = '') {
  if (!password || password.length < 12) throw new Error('Informe uma senha de desenvolvimento com pelo menos 12 caracteres.');
  const admin = localAdmin();
  const existing = [];
  for (let page = 1; ; page++) {
    const data = checked(await admin.auth.admin.listUsers({ page, perPage: 100 }));
    existing.push(...data.users);
    if (data.users.length < 100) break;
  }
  const users = [];
  for (const definition of demoUsers) {
    const email = definition.email.replace('@', `${suffix}@`);
    let user = existing.find(item => item.email === email);
    if (!user) {
      user = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nome: definition.nome } })).user;
    } else {
      // Explicit local seed refresh also refreshes these development passwords.
      checked(await admin.auth.admin.updateUserById(user.id, { password }));
    }
    checked(await admin.from('profiles').update({ ...definition, email, ativo: true, can_reopen_orders: definition.role === 'ADMIN' }).eq('id', user.id));
    users.push({ ...definition, email, id: user.id });
  }
  return users;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // No password is generated or printed by this command. Provide it in the process environment.
  await seedUsers(process.env.OP_DIGITAL_DEMO_PASSWORD);
  console.log('Criados/atualizados 5 usuários Auth e perfis de desenvolvimento no Supabase local.');
}

export function testPassword() { return randomBytes(32).toString('base64url'); }
