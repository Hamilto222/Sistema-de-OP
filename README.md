# OP Digital 1.0.0

Sistema de Gestão de Ordens de Produção para computadores e tablets industriais. Fluxo real: PCP cria/libera → operador executa → Qualidade revisa/trata NCs → PCP finaliza com PDF privado. PostgreSQL mantém histórico, auditoria e versões após reabertura.

## Stack e requisitos

Next.js/App Router, TypeScript, React, Tailwind CSS, Zod, Supabase PostgreSQL/Auth/Storage, supabase-js, pdf-lib/fontkit e Sharp. Node.js 24 e npm; Docker para desenvolvimento com Supabase local. CLI Supabase 2.76.15. O instalador incluído atende Linux amd64/arm64; em outros sistemas, instale a CLI oficial compatível. Testes de navegador requerem Chromium; testes de PDF usam Poppler (`pdfinfo`, `pdftotext`, `pdftoppm`). Esses utilitários não são necessários no servidor de produção.

## Instalação e desenvolvimento

```bash
npm ci
bash scripts/install-supabase.sh
npm run db:start
npm run supabase -- migration up --local
npm run env:local
npm run dev
```

Abra http://localhost:3000. `db:start` cria o banco pelas migrations na primeira instalação e aplica o catálogo de desenvolvimento. Em uma instância existente, `migration up --local` aplica somente migrations pendentes. `env:local` cria `.env.local` com URL/chave pública local e recusa sobrescrever configuração existente. `npm run db:stop` para os serviços preservando volumes.

Em Docker com driver VFS e pouco disco, execute `npm run db:prepare` antes de iniciar: compacta a imagem oficial verificada, preservando seu conteúdo. Em Docker normal não é necessário. Se o cache npm não for gravável, use `npm --cache /tmp/op-digital-npm-cache ci`.

## Variáveis de ambiente

Copie `.env.example` para `.env.local` ao configurar um projeto hospedado. Não misture local e produção.

| Variável | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto, obrigatória para autenticação/dados |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave publicável ou anon do mesmo projeto |
| `OP_DIGITAL_COMPANY_NAME` | Opcional: empresa sugerida na finalização, somente servidor |
| `OP_DIGITAL_DEMO_PASSWORD` | Somente processo de seed local, senha escolhida pelo desenvolvedor, mínimo 12 caracteres |
| `SUPABASE_CLI` | Opcional: caminho da CLI; padrão `.tools/supabase` ou CLI global |
| `SUPABASE_INTERNAL_IMAGE_REGISTRY` | Opcional: registry das imagens locais, padrão docker.io |
| `PLAYWRIGHT_CHROMIUM_PATH` | Opcional: executável Chromium dos testes, padrão /usr/bin/chromium |

A aplicação usa a sessão do usuário e RLS, sem service_role. Nunca forneça chaves administrativas ao frontend ou ao Git. Variáveis de seed/ferramentas não são necessárias na Vercel. A chave pública não substitui políticas de autorização.

## Supabase, migrations e primeiro ADMIN

As migrations em `supabase/migrations` são a fonte do schema, funções, triggers, permissões e quatro buckets privados. Não precisam de seed para construir o banco. Para um projeto hospedado, configure Auth (HTTPS, cadastro público desabilitado, senha mínima 12 caracteres), conecte a CLI e aplique:

```bash
npm run supabase -- login
npm run supabase -- link --project-ref SEU_PROJECT_REF
npm run supabase -- db push --dry-run
npm run supabase -- db push
```

Confirme o projeto antes de cada operação remota. Não executar reset em produção. Consulte [DEPLOYMENT.md](DEPLOYMENT.md) para configuração e limitações da hospedagem.

Crie a identidade inicial no painel **Supabase → Authentication → Users → Add user**, usando endereço e senha próprios. O trigger cria um profile OPERADOR inativo. No SQL Editor, por administração confiável, substitua o UUID abaixo pelo ID desse usuário:

```sql
update public.profiles
set nome = 'Administrador', role = 'ADMIN', ativo = true,
    can_reopen_orders = true
where id = 'UUID_DO_USUARIO_AUTH'::uuid;
```

Confira que exatamente um profile foi atualizado. Faça login; `/admin/usuarios` mantém os demais profiles. Criação de identidades, recuperação e alteração de senha permanecem no Supabase Auth, nunca por SQL de senha. Não conceda role via metadados do cadastro.

## Seed de desenvolvimento

O catálogo local contém 2 linhas, 3 produtos, 3 modelos e 13 itens. Para criar contas Auth reais de demonstração, escolha uma senha temporária forte e forneça-a somente ao processo:

```bash
read -rsp 'Senha de demonstração (mínimo 12 caracteres): ' OP_DIGITAL_DEMO_PASSWORD
export OP_DIGITAL_DEMO_PASSWORD
npm run seed:dev
unset OP_DIGITAL_DEMO_PASSWORD
```

Contas: admin@opdigital.example, pcp@opdigital.example, qualidade@opdigital.example, operador1@opdigital.example e operador2@opdigital.example. Não existe senha padrão. O seed de usuários recusa destinos externos. Veja [supabase/seed/README.md](supabase/seed/README.md). `npm run db:reset` reconstrói **destrutivamente somente o banco local**, incluindo catálogo; não é necessário para atualização normal.

## Validação e build

```bash
npm run db:types
npm run db:lint
npm run typecheck
npm run lint
npm run build
npm test
npm audit --omit=dev
```

Testes exigem Supabase local, catálogo e `.env.local` local. `npm test` executa testes Node/banco e depois Chromium em sequência; o navegador inicia sua própria build na porta 3100. Contas temporárias usam Auth real e são desativadas ao terminar. Histórico de testes permanece no banco local; não rodar contra produção ou ambiente compartilhado.

Para servir a build: `npm run start`. Publicação Supabase + Vercel, backup, restauração e atualização estão em [DEPLOYMENT.md](DEPLOYMENT.md). Guia de operação em [USER_GUIDE.md](USER_GUIDE.md).

## Estrutura e documentação

- `src/app`: rotas, layouts, Server Actions e documentos autorizados.
- `src/features`: Administração, Auth, PCP, Operador, Qualidade, dashboard e finalização.
- `src/components`, `src/hooks`, `src/lib`, `src/services`, `src/types`: componentes compartilhados, recuperação temporária, sessão, upload e tipos do banco.
- `supabase/migrations`, `supabase/seed`: schema versionado e dados locais úteis.
- `tests`, `scripts`, `assets/fonts`: regressões reais, ferramentas e fontes licenciadas do PDF.
- [PROJECT_SPEC.md](PROJECT_SPEC.md): requisitos permanentes; [ARCHITECTURE.md](ARCHITECTURE.md): arquitetura; [TASKS.md](TASKS.md): fases; [TEST_REPORT.md](TEST_REPORT.md): evidências e limites; [CHANGELOG.md](CHANGELOG.md): versões.

## Publicar

Crie o projeto Supabase de homologação, configure Auth e aplique `db push` conforme acima. Na Vercel, importe o repositório como Next.js/Node 24, instalação `npm ci` e build `npm run build`; informe as duas variáveis públicas Supabase e empresa opcional. Configure domínio HTTPS e Site URL no Auth. Teste todos os perfis e o fluxo até PDF antes de repetir em produção. Separe variáveis de Preview e Production. Confira os limites de upload/PDF em [DEPLOYMENT.md](DEPLOYMENT.md) antes de escolher essa hospedagem.

## Backup, atualização e restauração

**Backup:** mantenha backups gerenciados Supabase/PITR conforme o plano e copie separadamente os bytes dos quatro buckets privados, preservando paths/hashes. Backup de banco não contém os arquivos. Armazene cópias criptografadas fora do repositório e registre versão do código/migrations. Exports lógicos da CLI são complementares; suas exclusões de schemas gerenciados impedem tratá-los como backup integral de Auth/Storage.

**Atualizar:** faça backup verificável, leia CHANGELOG/migrations e valide a revisão em homologação. Execute `npm ci`, typecheck/lint/build/testes; confirme o projeto vinculado, `db push --dry-run` e `db push`; publique código compatível e confira o fluxo. Nunca use reset/seed de demonstração para atualizar produção. Rollback de código não desfaz migrations.

**Restaurar:** suspenda escritas, preserve o estado atual e ensaie em destino isolado. Restaure banco/Auth/metadata por backup gerenciado Supabase e restaure os objetos privados nos mesmos paths por administração confiável. Confira migrations, identidades/perfis, RLS, contagens, hashes e PDFs antes de reabrir acesso. Em novo projeto, atualize URL/chave pública e configurações Auth/domínio. Veja o procedimento detalhado e os limites de recuperação em [DEPLOYMENT.md](DEPLOYMENT.md).

## Limitações de produção

Validação local não equivale a deploy homologado. Storage e PostgreSQL não têm transação distribuída: PDF pendente tem retomada explícita; arquivos órfãos privados precisam de manutenção autorizada. Uploads são parseados/decodificados, sem antivírus; acesso direto autorizado ao Storage valida metadata, não bytes. URLs assinadas já emitidas permanecem válidas até expirar. Não existe execução offline.

A Vercel limita o tamanho de requisições a Functions, abaixo do limite de PDF de 20 MB aceito pelo app. Não anuncie suporte a uploads grandes nessa hospedagem sem validar a infraestrutura; veja DEPLOYMENT.md. Existe alerta upstream na cadeia de ferramentas ESLint registrado no relatório; dependências de produção foram verificadas separadamente. Segurança e publicação remota continuam pendentes de homologação.
