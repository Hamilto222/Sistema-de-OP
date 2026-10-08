import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const image='supabase/postgres:17.6.1.088';
const remote='registry-1.docker.io/'+image;
const crane='.tools/crane';
const directory=mkdtempSync(join(tmpdir(),'op-postgres-'));
try {
  const digest=execFileSync(crane,['digest',remote],{encoding:'utf8'}).trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error('Digest inválido.');
  const pinned=remote.split(':')[0]+'@'+digest;
  const metadata=JSON.parse(execFileSync(crane,['config',pinned],{encoding:'utf8'}));
  const config=metadata.config;
  const archive=join(directory,'rootfs.tar');
  // crane verifies downloaded blob digests and correctly applies OCI whiteouts when exporting.
  execFileSync(crane,['export',pinned,archive],{stdio:'inherit'});
  const args=['import','--platform',`linux/${metadata.architecture}`];
  for (const value of config.Env || []) args.push('--change',`ENV ${value}`);
  for (const [field,instruction] of [['Entrypoint','ENTRYPOINT'],['Cmd','CMD']]) {
    if (config[field]?.length) args.push('--change',`${instruction} ${JSON.stringify(config[field])}`);
  }
  if (config.User) args.push('--change',`USER ${config.User}`);
  if (config.WorkingDir) args.push('--change',`WORKDIR ${config.WorkingDir}`);
  if (config.Volumes) args.push('--change',`VOLUME ${JSON.stringify(Object.keys(config.Volumes))}`);
  for (const port of Object.keys(config.ExposedPorts || {})) args.push('--change',`EXPOSE ${port}`);
  args.push('--change',`LABEL op-digital.source-digest=${digest}`,archive,image);
  execFileSync('docker',args,{stdio:'inherit'});
  writeFileSync('.tools/postgres-source.digest',digest+'\n');
  console.log('Imagem oficial PostgreSQL compactada para VFS, mantendo filesystem e configuração de execução.');
} finally {
  rmSync(directory,{recursive:true,force:true});
}
