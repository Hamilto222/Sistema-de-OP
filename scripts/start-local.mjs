import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { localConfig } from './local-supabase.mjs';

const command=process.env.SUPABASE_CLI || (existsSync('.tools/supabase') ? '.tools/supabase' : 'supabase');
const child=spawn(command,['start','-x','studio,imgproxy,realtime,edge-runtime,logflare,vector,supavisor'],{
  env:{...process.env,SUPABASE_INTERNAL_IMAGE_REGISTRY:process.env.SUPABASE_INTERNAL_IMAGE_REGISTRY || 'docker.io'},
  stdio:['ignore','pipe','pipe'],
});
const messages=[];
// CLI status output includes local administrative keys. Never forward that output.
for (const stream of [child.stdout,child.stderr]) {
  const lines=createInterface({input:stream});
  lines.on('line',line=>{
    if (/^(Applying migration|Initialising schema|Seeding |Starting |Stopping |Started |failed to |Error:)/i.test(line)
      && !/(key|secret|token|password|credential)/i.test(line)) {
      messages.push(line.slice(0,300)); if(messages.length>30) messages.shift();
    }
  });
}
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill('SIGTERM'));
const exitCode=await new Promise(resolve=>{child.on('error',()=>resolve(1));child.on('close',code=>resolve(code ?? 1));});
if(exitCode!==0) {
  console.error('Falha ao iniciar Supabase local. Confira Docker, espaço e acesso às imagens.');
  messages.forEach(line=>console.error(line));
  process.exit(exitCode);
}
const config=localConfig();
const headers={apikey:config.key,Authorization:`Bearer ${config.key}`};
const health=await fetch(config.url+'/auth/v1/health',{headers,signal:AbortSignal.timeout(10_000)});
if(!health.ok) throw new Error('Auth local ainda não está saudável.');
const database=await fetch(config.url+'/rest/v1/production_orders?select=id&limit=1',{headers,signal:AbortSignal.timeout(10_000)});
const result=await database.json();
if(![401,403].includes(database.status) || result.code!=='42501') throw new Error('Banco ainda não está pronto ou acesso anônimo não foi bloqueado.');
console.log('Supabase local iniciado: Auth saudável e acesso anônimo à tabela de OPs bloqueado.');
