# Publicação e operação — OP Digital 1.0.0

## Supabase + Vercel

1. Crie projetos Supabase separados para homologação e produção, PostgreSQL 17 compatível com as migrations. Escolha região próxima dos usuários e recursos suficientes. Configure Auth com cadastro público desabilitado, política de senha e rate limits; Site URL com domínio HTTPS final e redirect URLs estritamente necessários. Configure SMTP confiável para recuperação de conta.
2. Instale Node 24/dependências/CLI conforme README. Faça login na CLI; `npm run supabase -- link --project-ref SEU_PROJECT_REF`. Confirme o destino e execute `npm run supabase -- db push --dry-run`, depois `npm run supabase -- db push`. Não incluir seed de desenvolvimento em produção. As migrations criam buckets e RLS; confira os quatro buckets privados e as permissões antes do uso.
3. Crie o primeiro ADMIN conforme README. Cadastre identidades reais no Auth e ative/atribua seus profiles. Cadastre linhas, modelos e produtos reais. Não importar contas de teste.
4. Importe o repositório na Vercel, framework Next.js, Node 24, diretório raiz do projeto. Instalação `npm ci`, build `npm run build`. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e opcionalmente `OP_DIGITAL_COMPANY_NAME`. Nunca configurar service_role para o aplicativo. Separe variáveis de Preview/Production; preview deve usar homologação.
5. Publique homologação e confira login/logout/inativação, todos os perfis, RLS e documentos privados, tablets e fluxo completo até PDF/reabertura. Configure domínio/TLS e Auth URLs definitivas antes de produção. Verifique fontes incorporadas no PDF, logs sem informações sensíveis e limites do plano.

Nenhuma publicação remota foi executada nesta entrega. Publicar o ambiente de desenvolvimento da nuvem também não publica a aplicação na Vercel.

## Limites que precisam ser homologados

**Uploads:** Vercel Functions têm limite de payload de aproximadamente 4,5 MB, incluindo multipart/overhead. A configuração Next `22mb` não aumenta esse limite. O app suporta originais de 20 MB e evidências de 10 MB no servidor; arquivos próximos desses limites não são garantidos na Vercel. Teste com arquivos reais abaixo do limite da plataforma. Para atender integralmente aos limites industriais atuais, use hospedagem Node com limite de request apropriado, ou planeje uma evolução de upload direto com validação segura; esse fluxo não foi implementado nesta versão. Não deixar a equipe depender de uploads de 20 MB na Vercel sem resolver essa incompatibilidade.

**PDF:** geração ocorre em Node, não Edge. Tempo/memória de Function devem atender ao volume real de checklist/apontamentos/anexo e limite de relatório de 40 MB. Em timeout, geração pode ficar PENDING; retomar pela interface PCP após corrigir a causa, sem sobrescrever versões. Verifique limites atuais do plano e da plataforma, que podem mudar.

**Segurança:** URLs emitidas pelo app expiram em 60 segundos; links já emitidos não são revogados instantaneamente. Parsing não é antivírus. A pendência de dependência de desenvolvimento e limites de API Storage estão em TEST_REPORT.md. Não considerar o checklist Segurança concluído por causa deste documento.

## Backup

Defina RPO/RTO, retenção, responsáveis e teste periódico de recuperação. Antes de atualizar, faça backup e registre versão do código e migrations aplicadas.

- PostgreSQL/Auth/metadata: use backups gerenciados Supabase e, quando disponível no plano, PITR. Confirme no painel Database → Backups a cobertura e retenção do plano. Preserve migrations, configurações e documentação no controle de versão.
- Arquivos: backup PostgreSQL **não inclui os bytes do Storage**. Copie separadamente todos os objetos dos quatro buckets privados (`op-originals`, `operator-evidence`, `quality-evidence`, `final-reports`) via API Storage ou S3 compatível em ferramenta administrativa autorizada. Preserve bucket/path, bytes e hashes; mantenha cópia criptografada e controle de acesso. Não usar URLs assinadas como backup.
- Para exportação lógica complementar: `npm run supabase -- db dump --linked --file backup-schema.sql` e `npm run supabase -- db dump --linked --data-only --use-copy --file backup-data.sql`. Esses comandos não substituem backup gerenciado completo: exclusões padrão de schemas gerenciados, Auth/Storage e roles precisam ser verificadas na documentação da versão da CLI. Guarde exports fora do repositório, criptografados; podem conter dados industriais/pessoais. Não afirmar que apenas esses dois arquivos restauram identidades e objetos.

## Restaurar

1. Suspenda escritas e preserve uma cópia do estado atual. Escolha ponto de recuperação e código compatível. Teste primeiro em ambiente isolado; não executar reset local como procedimento de produção.
2. Use a restauração gerenciada Supabase (backup/PITR) conforme o plano e confirme impacto/downtime. Para outro projeto, siga o procedimento oficial de migração/restore compatível de schemas gerenciados/Auth; não importar manualmente SQL de senhas nem sobrescrever schemas internos sem suporte.
3. Restaure os arquivos dos buckets privados com os mesmos paths. Verifique também objetos anteriores e relatórios de versões históricas: copiar somente o ponteiro atual da OP perde histórico. Respeite a configuração privada e restaure metadados/referências consistentes; as policies do aplicativo não permitem overwrite, portanto a operação exige administração confiável fora do runtime.
4. Confira migrations, FKs/RLS, contagens, profiles/identidades, buckets, hashes e PDFs; teste login e um fluxo completo. Em novo projeto, atualize URL/chave pública, configuração Auth/domínio/SMTP e considere invalidação de sessões antigas. Retome produção somente após validar banco **e** Storage.

Restauração remota e recuperação de desastre não foram executadas nesta entrega; devem ser ensaiadas antes de uso industrial. Consulte https://supabase.com/docs/guides/platform/backups e https://supabase.com/docs/guides/platform/migrating-within-supabase .

## Atualizar

1. Leia CHANGELOG e migrations; faça backup verificável de banco e arquivos. Instale a nova revisão com `npm ci` e valide em homologação (`db:lint`, typecheck, lint, build e testes locais).
2. Revise compatibilidade entre schema e aplicação. No projeto correto, `db push --dry-run`, depois `db push`; nunca editar uma migration já aplicada para tentar atualizar produção. Mudanças futuras usam nova migration.
3. Publique o código compatível, confira login/perfis/documentos/fluxo e monitore erros. Não resetar banco nem executar seed de demonstração durante atualização.
4. Rollback de código só é seguro se compatível com schema atual. Uma migration não é desfeita automaticamente pelo rollback Vercel; prepare correção incremental ou restauração coordenada conforme o plano de recuperação.

## Instalação limpa local

`npm run db:start` em projeto sem volumes constrói o banco pelas migrations; o catálogo local vem do seed configurado. Para verificar somente migrations sem seed, use uma cópia isolada de `supabase/config.toml` com outro `project_id`, portas livres e `[db.seed] enabled = false`. Copie as migrations, execute `supabase start --workdir CAMINHO_ISOLADO` e confira catálogo de migrations, RLS, tabelas e buckets. Nunca apagar os volumes do projeto existente para esse teste.
