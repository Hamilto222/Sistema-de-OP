# Arquitetura — OP Digital 1.0.1

## Stack e estrutura
Next.js App Router, TypeScript estrito, Tailwind CSS e Server Components por padrão. Node.js 24, versões exatas e package-lock.json. Fonte do sistema; build Webpack. Client Components nas interações de login, menu de tablet, formulários, editor de itens e confirmações. Leituras e mutações permanecem no servidor.

- `src/app`: rotas, layouts, estilos; `/` e `/login` públicos, `/sistema` exige perfil ativo e `/admin/*` exige ADMIN ativo, `/pcp/*` exige ADMIN/PCP ativos e `/operador/*` exige OPERADOR ativo; `/qualidade/*` exige ADMIN/QUALIDADE ativos.
- `src/components`: apresentação compartilhada.
- `src/features/auth`: formulário e ações reais de login/logout.
- `src/features/admin`: schemas Zod, Server Actions, listagem server-side, formulários e editor de checklist.
- `src/features/operator`: ações/RPCs de execução, validação, formulários para tablet e tempo decorrido; `src/hooks/use-form-draft.ts` mantém recuperação temporária separada da fonte oficial.
- `src/features/finalization`: ações/formulários PCP/reabertura, snapshot oficial, geração/retomada PDF e listagem de versões; fontes licenciadas em `assets/fonts`.
- `src/features/quality`: schemas Zod, ações CQ/NC, consultas com RLS, formulários e traduções dos enums.
- `src/features/pcp`: schemas, ações autorizadas, lookups, filtros/listagem e formulários de OP/PDF/preparação.
- `src/components/ui/order-status.tsx`: tradução e badge reutilizáveis para os dez status da OP.
- `src/components/ui`: campos, tabelas, badges, estados de loading/vazio/erro e confirmação de desativação.
- `src/components/authenticated-shell.tsx`: cabeçalho, identidade, logout e navegação responsiva compartilhados.
- `src/lib/auth`: perfil ativo, verificação de sessão e guard de roles.
- `src/lib/supabase`: configuração validada por Zod e cliente SSR exclusivamente no servidor.
- `src/lib/locale.ts`: pt-BR e America/Sao_Paulo.
- `src/services/storage.ts`: geração de URL assinada com sessão do usuário.
- `src/types/database.ts`: tipos gerados pelo Supabase CLI a partir do banco local.
- `supabase/migrations`: schema, permissões e Storage versionados.
- `supabase/seed`: catálogo e usuários Auth demonstrativos, somente locais.
- `scripts`: CLI com checksum, configuração local, tipos e utilitários de testes.
- `tests`: integração RLS via supabase-js e navegador com Auth real.

## PostgreSQL e identidade
Onze entidades principais e o registro `final_reports`, FKs e índices para linha, operador, status, data e relacionamentos. `timestamptz` para instantes, `date` para data programada, `numeric` para quantidades/tolerâncias e JSONB para configuração flexível. Constraints cobrem quantidades, intervalos, revisão, aprovação e fechamento; FK composta impede NC ligada a item de outra OP. Enums: roles, status OP, resposta, momento, prioridade, tipo de apontamento, severidade e status NC.

Auth cria perfil OPERADOR inativo e sincroniza mudanças de e-mail. Role, ativação e permissão de reabertura são administradas no banco, nunca concedidas por metadados enviados pelo usuário. Primeiro ADMIN é provisionado por operação confiável do administrador Supabase; o ADMIN gerencia os demais profiles pela UI, sem escrever identidade/senha no banco.

## Sessão e proteção de rotas
`@supabase/ssr` mantém sessão em cookies HttpOnly, SameSite=Lax, Secure em produção. Não há cliente browser, autenticação fake ou localStorage de sessão. Login/logout usam Server Actions (POST e validação de origem do Next.js) e Auth real. `getUser()` verifica identidade no Auth. Perfil é consultado no PostgreSQL a cada verificação; não usar role de JWT/metadados como fonte de autorização.

`src/proxy.ts` renova cookies e protege navegação em `/sistema/*`, `/admin/*`, `/pcp/*`, `/operador/*` e `/qualidade/*`. Layouts/páginas usam `requireActiveProfile`/`requireRole`, e cada ação administrativa verifica ADMIN internamente, cada ação PCP verifica ADMIN/PCP ativos e cada ação de execução verifica OPERADOR ativo e cada ação CQ/NC verifica ADMIN/QUALIDADE ativos. POSTs com Next-Action recebem o protocolo de redirect da própria Server Action; um redirect convencional do proxy interromperia a resposta React. POSTs sem esse protocolo usam redirect 303, sem reenvio do formulário. A autorização da ação é obrigatória mesmo quando enviada a outra rota. Futuras ações de domínio devem manter essa verificação e consultas com a sessão do usuário. Layout/proxy não substituem autorização dentro de cada ação/API. Rotas protegidas não são cacheadas publicamente. Sem configuração, o login informa indisponibilidade e não permite acesso. Sem cadastro público na configuração local.

## RLS e controle de campos
Todas as tabelas têm RLS. Funções auxiliares no schema `private` consultam perfil ativo e autorização por OP, com `SECURITY DEFINER`, search_path fixo e sem exposição na API. A política da própria OP autoriza pelos campos da linha diretamente; não consulta a OP recém-inserida dentro de função STABLE, evitando negação incorreta de INSERT RETURNING. service_role possui acesso aos helpers apenas para operações confiáveis de manutenção/seed. Anônimos não acessam tabelas da aplicação. Usuário inativo só pode ler o próprio perfil para diagnóstico de acesso; não usa catálogo, OPs ou Storage.

| Recurso | ADMIN | PCP | QUALIDADE | OPERADOR |
| --- | --- | --- | --- | --- |
| Perfis | Administrar | Consultar | Consultar | Próprio perfil |
| Catálogo/modelos | Administrar, sem delete físico | Consultar | Consultar | Consultar |
| Páginas/actions ADMIN | Permitido | Negado | Negado | Negado |
| Páginas/actions PCP | Permitido | Permitido | Negado | Negado |
| Páginas/actions OPERADOR | Consulta pelo PCP; não executa como operador | Negado | Negado | Permitido |
| Páginas/actions CQ/NC | Permitido | Negado | Permitido | Negado |
| OPs | Administrar | Planejar, liberar, finalizar | Consultar não rascunhos; bloquear/revisar/aprovar | Somente atribuídas ou linha ativa autorizada, fora de rascunhos/preparação/canceladas |
| Checklist OP | Administrar | Preparar antes de liberar | Revisar sem alterar medição | Responder em produção, sem alterar definição |
| Apontamentos | Administrar | Consultar | Consultar | Criar com autoria própria em produção |
| NC | Administrar | Consultar | Tratar, aprovar, fechar | Abrir e tratar próprias, sem aprovação CQ |
| Auditoria | Consultar | Da OP acessível | Da OP acessível | Da OP acessível |
| Notificações | Administrar | Próprias | Próprias | Próprias |

RLS limita linhas; triggers limitam **colunas e transições**. PCP não altera medição, assinatura de operador ou CQ. Operador não altera planejamento, revisões CQ ou finalização. Qualidade não reescreve medições. Autoria e horários de medição/revisão/aprovação são registrados pelo banco. Alterações de checklist/NC/apontamento bloqueiam a linha da OP para evitar corrida com finalização.

Reabertura exige ADMIN ou profile ativo autorizado por `can_reopen_orders`, acesso à OP, motivo, OP finalizada e relatório pronto. Reabertura limpa aprovações e revisões, preservando medições e histórico. `version` incrementa no banco; as ações verificam a versão lida e tratam atualizações obsoletas como conflito.

Liberação exige checklist e referência de PDF; envio CQ exige itens obrigatórios medidos, quantidades preenchidas e ausência de item/NC impeditivos. CQ precisa concluir revisões e NCs impeditivas antes de enviar ao PCP; NCs não impeditivas podem seguir em tratamento conforme a seção CQ. Medição não conforme marcada como bloqueante bloqueia a OP atomicamente. Resposta NUMBER calcula conformidade por limites; BOOLEAN compara com `configuracao.resposta_conforme` (true quando ausente em snapshots históricos); SELECT usa `opcoes`/`opcoes_conformes`; TEXT e PHOTO confirmam preenchimento e ainda exigem revisão CQ quando configurado. Fases de domínio deverão aprofundar os critérios sem enfraquecer estes controles.

## Auditoria e integridade
Triggers escrevem alterações por campo, com valor anterior/novo e ator de `auth.uid()`. Escrita de auditoria não é concedida a usuários da aplicação, incluindo ADMIN. Usuários e registros usados por histórico têm restrições de exclusão via FKs; cancelar/inativar em vez de apagar histórico. Acesso administrativo total respeita integridade e auditoria imutável. Operações confiáveis de migration/seed/testes usam privilégios administrativos e podem registrar ator nulo; módulos normais nunca devem usar service_role para contornar RLS.

## Documentos industriais
Buckets privados `op-originals`, `quality-evidence`, `operator-evidence`, `final-reports`. Caminho: `<UUID_DA_OP>/<nome-unico-do-arquivo>`. Limites e MIME types definidos por migration. Leitura depende da OP; escrita depende do bucket, role e etapa. Evidências são append-only; não há delete por cliente. Objetos originais são imutáveis; PCP/ADMIN pode vincular novo arquivo em rascunho, sem sobrescrever o anterior; relatórios têm escrita restrita a PCP/ADMIN em caminho emitido para geração pendente, sem overwrite/delete. Políticas não tornam bucket público.

URLs assinadas duram 60 segundos; não registrar tokens em logs nem persistir URLs. Revogação de acesso não invalida instantaneamente links já assinados: exposição é limitada por esse prazo. Upload original PCP valida extensão, MIME, máximo 20 MB e marcadores PDF no servidor. `pcp_attach_original` verifica caminho, existência e metadata no bucket privado. A abertura usa `/pcp/ordens/[id]/pdf`, com autorização interna, redirect de signed URL no clique, Cache-Control private/no-store e Referrer-Policy no-referrer. Relatório final está descrito abaixo; não há análise completa/antivírus; retenção continua tarefa própria.

## Ambiente e testes
Supabase CLI 2.76.15 obtido de release oficial, com SHA256 verificado. Docker Hub oficial usado como mirror de ECR, cujo acesso foi negado neste ambiente. CLI fica em `.tools/` ignorado; dados em volumes Docker. Configuração Supabase local está versionada. Seed/testes leem chaves locais em memória; só URL e chave pública são gravadas em `.env.local` ignorado, sem substituir arquivo existente.

Testes RLS usam contas criadas pelo Auth real, JWTs obtidos por login e chamadas à API que exercitam PostgreSQL/Storage. Testes browser usam Chromium, login SSR e cookies reais. Não há mock de banco/Auth. Dados e senhas de teste não são embutidos no runtime; contas de teste são desativadas no teardown.

## Limites
Os módulos Administração, PCP, Operador, CQ/NC, finalização/PDF/reabertura e dashboard estão implementados e testados localmente. Provisionamento de identidades e credenciais permanece no Supabase Auth. Não há deploy/homologação remota executados. Segurança mantém pendência upstream da cadeia ESLint e validações de produção conforme TEST_REPORT.md; os testes locais estão concluídos. O contrato de hospedagem e os limites Vercel estão documentados ao final e em DEPLOYMENT.md.

## Administração e preservação de histórico
Listagens server-side com count, paginação de 20 e pesquisa ilike por campo permitido; valor é passado pela API do SDK, com escaping de curingas, sem interpolação em filtros OR. Vínculos de linhas/modelos são carregados em lotes para não truncar no limite padrão da API. Formulários têm rótulos, erros em pt-BR e confirmação modal de desativação. Tabelas usam rolagem interna no tablet; o menu adaptativo não excede a largura da tela.

`admin_save_checklist(jsonb)` é SECURITY INVOKER, exige ADMIN ativo explicitamente e usa RLS/ator reais. Cria ou bloqueia o modelo existente, verifica updated_at, grava metadados e substitui o conjunto de itens dentro da mesma transação. Itens anteriores recebem ativo=false; índice único parcial permite uma ordem por modelo nos itens vigentes, preservando os antigos UUIDs. FKs e snapshots de `production_order_checklist` não são modificados. Falha em qualquer item desfaz o agregado inteiro, incluindo auditoria. Duplicação/revisão envia um agregado novo, sem id, com validação da combinação nome/revisão única. Produtos continuam ligados à revisão previamente escolhida.

Linhas/produtos/profiles são gravados com filtros id e updated_at; zero linhas significa conflito/registro indisponível. Desativação segue o mesmo controle. Novos itens de checklist são validados por trigger, incluindo SELECT e resposta conforme BOOLEAN. Escrita no catálogo é exclusiva de ADMIN nesta fase; PCP conserva consulta e preparação do checklist da OP, sem manutenção do modelo. DELETE de profiles/catálogos foi revogado de authenticated. Um trigger impede alteração de id/e-mail/criação do profile e revogação do próprio acesso ADMIN; e-mail permanece sob sincronização do Auth.

## PCP, transações e PDF
`pcp_create_order(jsonb)` é SECURITY INVOKER: valida ADMIN/PCP ativo, produto/linha ativos, operador e campos; insere apenas rascunho com created_by do Auth. Horário local é convertido no PostgreSQL com `AT TIME ZONE 'America/Sao_Paulo'`; trigger sincroniza data_programada date. Histórico sem horário permanece somente com a data original. Índices de updated_at e finalização apoiam consultas.

`pcp_prepare_order(id,expected_version)` bloqueia a OP FOR UPDATE, exige DRAFT/versão/dados/PDF real e nenhum checklist prévio. Altera para PREPARING, obtém produto/linha/modelo consistentes, copia todas as definições ativas de uma vez e grava os metadados do modelo, depois RELEASED. Tudo, incluindo auditoria automática, ocorre na mesma transação. Triggers de domínio continuam rodando como authenticated, sem contornar RLS, autoria, versão ou integridade. Não há INSERT manual em audit_logs pela aplicação.

Locks de leitura FOR SHARE também aplicam política UPDATE no PostgreSQL; como o catálogo é somente leitura para PCP, helpers `private.pcp_lock_product/line/template` SECURITY DEFINER autorizam explicitamente ADMIN/PCP ativos e bloqueiam somente o registro solicitado. Não são expostos por PostgREST, não escrevem em catálogo e têm search_path vazio/execução anônima revogada. RPCs públicas mantêm SECURITY INVOKER. ADMIN editar o modelo aguarda o lock, impedindo cópia de metade de uma edição de agregado.

Storage exige OP já existente para autorizar upload; criação+upload não são uma transação distribuída. A ação valida primeiro o PDF, cria DRAFT, envia arquivo com nome único/upsert=false e chama RPC de vínculo, com lock/versão/status e verificação de storage.objects. Falha mantém rascunho com link de recuperação. A tela da OP oferece anexar/substituir somente em DRAFT. Objetos anteriores/não vinculados ficam privados, sem delete automático nem service_role; retenção/limpeza é operação futura autorizada. Limite do corpo Next.js/proxy 22 MB acomoda PDF máximo de 20 MB e multipart. Requisições maiores são limitadas pelo framework; o servidor valida tamanho individual antes de ler o conteúdo. Formulário de nova OP preserva campos/arquivo em erros e usa dispatch da Server Action em transition, sem reset nativo automático.

`pcp_order_list` é view SECURITY INVOKER: joins de produto/linha/operador conservam RLS das tabelas. Filtros são validados por Zod e passados pelo SDK; pesquisa OR usa colunas fixas e valores quoted com escaping de aspas, barras e curingas (testado também com número contendo vírgula/aspas/%/_/barra). Paginação de 20, ordem por atualização/id; lookups em lotes evitam limite silencioso de 1000. `pcp_dashboard()` agrega indicadores reais no banco e calcula limites de hoje em São Paulo. Detalhes consultam snapshots, notas/NCs/aprovações e eventos de auditoria sem alterar execução/CQ.

## Execução do operador
RPCs públicas `operator_start_order`, `operator_save_measure`, `operator_add_note`, `operator_submit_order` são SECURITY INVOKER e exigem OPERADOR ativo internamente. Consultas usam o cliente SSR do usuário e RLS. OP bloqueada FOR UPDATE antes das mutações; início/envio com versão e medição com updated_at detectam concorrência. Triggers também protegem PATCH direto, sem depender de RPC/UI. Atualização de evidência/medição não permite alterar definição, autor, data, conformidade ou revisão.

`private.guard_checklist` calcula conformidade a partir do snapshot e exige observação não conforme. `private.validate_operator_photo` é invoker e consulta storage.objects sob RLS, verificando bucket/OP/MIME/tamanho. Fotos podem acompanhar qualquer resposta. Autoria e horário permanecem no banco. Triggers de auditoria mantêm valores anteriores em alterações. Apontamentos aceitam os sete tipos atuais; enum PRODUCAO permanece para dados históricos.

O trigger restrito `private.block_nonconforming_order` usa definer para aplicar bloqueio derivado da medição e criar NC sem conceder ao operador permissão genérica de alterar status para BLOCKED_QUALITY. Incrementa versão, registra ator auth.uid(), cria NC CHECKLIST/ALTA/impeditiva com referência/evidência. `private.notify_quality_transition` insere mensagens somente nas transições reais para BLOCKED_QUALITY/AWAITING_QUALITY e somente para perfis QUALIDADE ativos. São triggers sem API pública, search_path vazio, execução pública revogada; não há escrita de auditoria ou notificações arbitrárias pelas ações. A transação reverte tudo em falhas, incluindo notificações.

NCs ganham impeditiva default true e índice de pendências. Operador não desclassifica impedimento; CQ/ADMIN mantêm competência para tratamento futuro. Envio exige status, quantidades não negativas/finitas preenchidas, obrigatórios medidos, ausência de medição impeditiva não conforme e NC impeditiva aberta. Zero é válido. Mesmo NC fechada não autoriza enviar item impeditivo ainda não conforme. Alterações concorrentes em checklist/NC bloqueiam a OP; após envio, triggers recusam novos registros do operador.

UI usa cards, cabeçalho sticky, formulários com botões/inputs amplos, grupos ANTES/DURANTE/DEPOIS e pendências claras. Consulta a view invoker já existente conserva RLS, sem introduzir acesso privilegiado. Minhas OPs pagina 20; detalhes mostram até 100 notas recentes, com aviso de limite; checklist tem até 100 definições copiadas do modelo. OPs posteriores à execução são consultáveis conforme RLS. ADMIN usa PCP para consulta administrativa, sem assumir a identidade de operador.

Server Actions validam Zod e foto (extensão/MIME, até 10 MB e decodificação real JPEG/PNG/WebP), enviam Storage com sessão do usuário/upsert=false e gravam via RPC. Arquivo anterior ou objeto não vinculado após erro permanece privado; limpeza não automática. Rotas pdf/evidencia buscam vínculo da OP/item/nota com RLS antes de assinar, TTL 60s, private/no-store e no-referrer. Limite multipart Next 22 MB existente acomoda foto até 10 MB. Há limite de 20 megapixels e timeout de cinco segundos na decodificação; não há antivírus.

Recuperação textual opcional usa sessionStorage na mesma aba, chave de usuário/OP/formulário/snapshot, TTL de recuperação 24h e restauração explícita. Não contém arquivos, tokens ou credenciais; PostgreSQL continua oficial. Erros retornados preservam campos e arquivo selecionado; em refresh/quebra da conexão a foto deve ser reselecionada. Sucesso limpa rascunho antes do refresh de Server Components para evitar unmount antes da limpeza; logout elimina todos os rascunhos desta aba. beforeunload avisa edição pendente; navegação interna conserva recuperação. Falhas de persistência no navegador não impedem gravação oficial. Não implementa modo offline nem sincronização automática.

## Verificação atual
Vinte e sete migrations aplicadas incrementalmente sem reset; enums novos separados da migration que os utiliza, para respeitar commit do PostgreSQL. Tipos gerados, lint SQL, TypeScript, ESLint e build. Evidências e contagens finais estão em TASKS.md/README.md. Os testes usam Auth, PostgreSQL, Storage e Chromium reais, incluindo bypass da UI, concorrência, falha de criação de NC, bloqueio/notificação/rollback, perdas zero, formulário preservado, recuperação após refresh/conexão interrompida e viewport de tablet. Sem migration remota/deploy.

## CQ, NC e máquina de estados
Migrations 12–16 evoluem os enums existentes e booleano de aprovação CQ para `quality_decision` (APPROVED/REJECTED/null), preservando dados. Adicionam motivo_bloqueio, motivo_retorno_cq, data_envio_cq, codigo_legado e encerrado_por, índices de fila/revisão/NC e view `quality_nc_list` SECURITY INVOKER. Aprovação FINALIZED usa comparação explícita que não aceita NULL.

`private.order_transition_allowed` e `private.nc_transition_allowed` centralizam grafos por perfil. `private.guard_order`, `private.guard_checklist` e `private.guard_nc` validam campos, estado, ator e critérios também na API direta. RPCs públicas `quality_review_item`, `quality_decide_order`, `quality_save_nc`, `quality_dashboard` e `quality_nc_document` são SECURITY INVOKER, verificam perfil ativo e conservam RLS. Helpers de notificação/contador/limpeza usam privilégios restritos com search_path fixo, sem exposição na API. Nenhum runtime usa service_role.

Transições CQ da OP:
- RELEASED/IN_PRODUCTION/AWAITING_QUALITY → BLOCKED_QUALITY: motivo obrigatório, REJECTED e assinatura real; notificações PCP/operadores autorizados.
- AWAITING_QUALITY → AWAITING_PCP: APPROVED, produção concluída, obrigatórios medidos, todos os itens requerendo revisão revisados e ausência de NC impeditiva aberta; assinatura e notificação PCP atômicas.
- BLOCKED_QUALITY → IN_PRODUCTION: exclusivamente quality_release_correction, com NC impeditiva documentada IN_TREATMENT; alteração de status da NC e quality_decide_order não liberam execução. Limpa decisão/fim/envio/revisões, mantém início e medições. Operador corrige/mede, CQ encerra NC e operador reenvia conforme regras estritas.
- BLOCKED_QUALITY → AWAITING_QUALITY: justificativa, produção já concluída, obrigatórios e impedimentos resolvidos; conserva fim/revisões e renova envio. Item impeditivo não conforme preservado exige NC correspondente fechada e aprovada, sem apagar resposta original.

`private.assert_quality_ready` compartilha critérios de retorno/aprovação; aprovação também exige revisões. Gravações travam OP antes de item/NC; versão/updated_at detectam concorrência. Ator/data são obtidos de auth.uid()/now(), inclusive ADMIN; clientes não definem assinaturas. Reiniciar revisões não representa nova medição: trigger de bloqueio só reage a INSERT ou alterações efetivas de resposta/conformidade/evidência/data da medição, prevenindo novo bloqueio indevido durante retorno.

NC nasce OPEN; OPEN → IN_TREATMENT/AWAITING_QUALITY/CANCELLED; IN_TREATMENT → AWAITING_QUALITY/CLOSED/CANCELLED; AWAITING_QUALITY → IN_TREATMENT/CLOSED/CANCELLED. CLOSED/CANCELLED são terminais. Operador mantém tratamento próprio não impeditivo anteriormente autorizado; NC impeditiva é somente consultável e seu tratamento pertence ao CQ/ADMIN. CQ/ADMIN exige ação imediata/responsável ativo/observação CQ para fechar; cancelamento exige justificativa. Nova NC/tratamento só em RELEASED/IN_PRODUCTION/BLOCKED_QUALITY/AWAITING_QUALITY. Exceção: CQ/ADMIN trata NC já não impeditiva em AWAITING_PCP, proibindo nova NC ou torná-la impeditiva e mantendo aprovação da OP. FINALIZED/CANCELLED continuam consulta.

Contador anual privado com UPSERT serializado gera `NC-AAAA-00001` pelo timezone São Paulo, sem colidir em concorrência ou aceitar código do cliente. Migração renumera NCs existentes por abertura/id, preserva código anterior e registra auditoria. Contador não é acessível a authenticated. Exclusão física de NC revogada inclusive ADMIN.

UI CQ usa cards e grupos legíveis em tablet, lista/pesquisa/paginação de 20, detalhes com histórico de até 100 alterações recentes (integral no banco). Esperado usa snapshot/configuração; revisão destaca pendências. A rota `/qualidade/op/[id]/documento` exige role e vínculo OP/item/NC, obtém bucket real da evidência e assina por 60s, private/no-store/no-referrer. Upload CQ valida JPEG/PNG/WebP/PDF até 10 MB, extensão/MIME/tamanho, parsing real PDF e decodificação de imagens, sem overwrite; objeto em erro posterior fica privado. Evidência pós-aprovação só é autorizada para tratamento de NC não impeditiva aberta. Formulários não resetam em erro; nomes acessíveis dos textareas usam labels explícitos, inclusive ao editar dados existentes.

Testes CQ exercitam todos os pares de transições válidas/inválidas, critérios e assinatura em PATCH direto, concorrência, contador, NC terminal, RLS/Storage, rollback de decisão quando notificação falha e fluxo completo de bloqueio automático/correção/aprovação. Chromium verifica edição, rejeição, tratamento, PDFs/evidências privadas, tablet, bypass de HTML e ação enviada a outra rota. Resultados consolidados em TASKS.md.

## Finalização, relatório imutável e retomada
Migrations 17–21 convertem aprovacao_pcp para enum de decisão, incluem empresa_nome e criam `final_reports` com FK/unique por OP+versão, RLS por OP e SELECT exclusivo para clientes. `pcp_finalize_order` é SECURITY INVOKER, exige PCP/ADMIN ativo e lock/versão. Trigger `guard_order` valida critérios com `assert_quality_ready`, protege assinaturas e estado mesmo em PATCH direto; actor/data são auth.uid()/now(). Trigger `capture_final_report` restrito cria snapshot completo na transação, sem limites PostgREST: agregações de checklist, notas, NCs e nomes reais dos responsáveis. Falha ao capturar reverte OP/assinatura/versão/auditoria. Snapshot de operator_submission deriva do último evento imutável IN_PRODUCTION → AWAITING_QUALITY, identificando o remetente real da execução, enquanto preserva o operador planejado e exclui retorno CQ. Cada finalização gera outro UUID/caminho; row version da OP é versão de concorrência, não contador sequencial de relatórios.

`final_reports` é registro durável de geração, com PENDING → READY. A aprovação/finalização PostgreSQL ocorre antes de produzir os bytes, para manter snapshot estável e permitir recuperação depois de processo/conexão interrompido. Server Action usa sessão real; `renderStoredReport` revalida identidade/role/ativação, lê snapshot, baixa original privado, gera/valida PDF, envia arquivo upsert=false e chama `complete_final_report`. Esse helper SECURITY DEFINER tem autorização interna PCP/ADMIN ativo, acesso à OP, locks OP→registro, versão/estado e existência/MIME/tamanho do objeto; modifica exclusivamente status/metadados do registro e ponteiro de relatório da OP. Ele conserva auth.uid() para auditoria e não fornece mutação arbitrária. Não há service_role no runtime.

Se upload/geração falha, OP permanece FINALIZED, registro PENDING, UI exibe pendência e oferece retomada; reabertura é recusada. Se arquivo foi enviado antes da falha de vínculo, retomar sem overwrite, verificar Subject/Keywords com UUID/versão, reabrir PDF e recalcular SHA256/páginas. READY é idempotente e não regenera bytes. Ponteiro atual é null durante nova geração, enquanto registry preserva versões anteriores. Arquivos sem registro/vínculo não são apagados automaticamente; retenção continua manutenção futura. Não há worker/cron ou transação distribuída.

`generateFinalPdf` é renderizador Node sem cliente/banco: pdf-lib/fontkit e Open Sans Regular/Bold com licença Apache-2.0 incluída. Full embedding evita falha de subset observada no fontkit. Fontes entram no tracing de produção em next.config.ts. Texto pagina, quebra palavras extensas, suporta pt-BR/acentos/Unicode coberto pela fonte e representa glifos não suportados por código. Snapshot contém todas as linhas, sem limites de API/lista. Geração registra metadata/identificador/versão e data São Paulo no corpo; footer numera páginas do relatório. Relatório é salvo completo antes da combinação em outro PDFDocument, evitando cache de streams que omitiria rodapé quando desenhado após save. Original compatível é copiado como anexo; inválido/criptografado/incompatível mantém PDF separado com indicação visível. Copiar páginas não certifica nem preserva assinatura digital do original, que continua arquivado intacto. PDF final é reaberto e páginas conferidas antes do upload; limite final-reports 40 MB.

Política Storage diferencia final-reports antes de ADMIN genérico e exige caminho exato emitido para PENDING/versão atual/OP FINALIZED; argumento `$2` qualificado evita sombra da coluna path. Buckets privados, sem policy UPDATE/DELETE para relatórios. A rota autenticada `/sistema/ordens/[id]/relatorios/[reportId]` valida ambos UUIDs, vínculo OP/relatório e READY sob RLS, depois assina por 60s, no-store/no-referrer. PCP/CQ/operador veem versões apenas conforme autorização à OP. SHA256 registra bytes do arquivo; não é assinatura digital e banco não interpreta o conteúdo binário do Storage. PCP/ADMIN autorizado à finalização também pode usar a API diretamente dentro destas regras; snapshot do banco permanece protegido.

## Reabertura e auditoria integral
`reopen_order` é SECURITY INVOKER. `private.can_reopen_order` centraliza perfil ativo ADMIN/flag e acesso real à OP; trigger exige FINALIZED/REOPENED, motivo e registro pronto, limita colunas a status/motivo e limpa aprovações/horários/fim/envio/revisões. Preserva respostas/histórico/arquivos/registro; operator_start_order agora aceita REOPENED com versão/ator real e inicia novo ciclo. UI autorizada está no PCP/CQ/operador conforme perfil e acesso à OP. Sem replanejar ou alterar definições antigas automaticamente.

OP FINALIZED é imutável mesmo para ADMIN na API; `aa_freeze_finalized` também impede INSERT/UPDATE/DELETE nos filhos, antes dos guards existentes e com lock da OP. Correção só após reabertura. Privilégios postgres/service_role continuam reservados a manutenção confiável externa ao runtime. Guards de roles/estados existentes protegem alterações após retomada.

`audit_change` inclui final_reports, com OP relacionada e actor real, além de todas as entidades anteriores. Clientes não escrevem/apagam logs. Snapshot é registrado na auditoria e status READY/ponteiro são auditados na transação de vínculo. Consulta `/pcp/ordens/[id]/auditoria` é paginada em 50, ordenada por timestamp/id e mostra entidade/ação/campo/ator/antes/depois, sem excluir eventos antigos. Usuários de teste continuam desativados ao fim; logout Auth pode invalidar outras sessões, então fixtures que geram PDF fazem novo login real antes da geração.

## Dashboard e componentes compartilhados
Migration 22 adiciona `dashboard_analytics(date,date)` somente leitura, SECURITY INVOKER, com autorização ADMIN/PCP/QUALIDADE ativos e RLS preservada. CTEs selecionam OPs pela programação e agregam em PostgreSQL seus snapshots e NCs, evitando truncamento PostgREST/paginação de dados para totais. Não altera RPCs ou máquina de estados existentes. `src/features/dashboard/analytics.tsx` valida período e payload com Zod e renderiza gráficos de barras em HTML/CSS no servidor; sem dependência gráfica/client chart. A interface distingue período analítico da fila CQ completa e dos demais filtros da lista PCP. Quantidades por unidade; conformidade sobre resultados atuais; critérios completos em PROJECT_SPEC.md.

`Breadcrumbs` usa pathname e rotas reais; `AuthNavigation` marca somente o caminho mais específico. `SuccessNotice` compartilha feedback não temporizado, role=status e fechamento explícito; nova resposta de ação permite novo aviso. Tokens CSS preservam inputs/botões existentes, adicionam card, aviso, foco e alvos de toque. Tabelas compartilhadas são regiões com rolagem/foco; PCP usa cards abaixo de 1280px e tabela acima. Diálogos nativos preservam foco/modalidade e têm limites de viewport. Nenhum arquivo industrial passa por novos componentes/clientes privilegiados.


## Correções e verificação da auditoria técnica
Migrations 23–27 fecham lacunas sem mudar a organização dos módulos. `private.can_write_object` aplica perfil/estado/bucket também ao ADMIN; não há UPDATE/DELETE autorizado em originais, evidências ou relatórios. A exceção de geração é o caminho exato do registro PENDING/versão atual/OP FINALIZED. Nomes são restritos e sempre subordinados à OP autorizada.

`a0_checklist_integrity` trava a OP e impede alterar definições depois da liberação, inserir snapshot medido/revisado ou falsificar autoria/respostas como ADMIN. O validador existente de itens de modelo também valida o snapshot; limites finitos e configuração BOOLEAN/SELECT valem no banco. Triggers posteriores continuam calculando conformidade e assinando revisões. `a0_validate_release` verifica objeto privado vinculado/MIME/tamanho mesmo em PATCH direto. DELETE de OP/checklist/apontamentos é revogado para authenticated. Constraint de apontamento cobre descrição/unidade em INSERT e UPDATE.

Índices adicionais atendem notificações completas por destinatário/data, responsáveis de encerramento de NC e criação/conclusão de relatórios. O índice integral `(template_id,id)` de itens suporta histórico/FK também para itens aposentados, ao contrário do índice parcial ativo. Teste de catálogo PostgreSQL verifica RLS em todas as tabelas públicas, FKs com índice de prefixo integral, constraints validadas e helpers definer com search_path vazio/EXECUTE negado a anon.

`src/services/upload-validation.ts` é um validador puro Node usado pelas três áreas de upload. pdf-lib parseia PDFs e exige páginas; sharp, já transitivo do Next e agora declarado diretamente, decodifica imagens de formato correspondente ao MIME, limita pixels e tempo. Os bytes originais continuam preservados. Não usa chave privilegiada, não faz upload e não altera o fluxo de Storage/RPC. Supabase direto continua validando metadata e RLS, sem parser binário no PostgreSQL.

Retomada do PDF verifica Subject/UUID e Keywords como tokens exatos de versão/combinação, além de parsing/páginas/40 MB. Cabeçalhos globais da aplicação usam nosniff, X-Frame-Options DENY e Referrer-Policy no-referrer; preservam a política das rotas de documentos. Cabeçalhos do host Storage são responsabilidade desse serviço. Links emitidos aqui expiram em 60s, mas chamadas autorizadas diretas ao Storage podem escolher outros TTLs. Links bearer já emitidos não são revogados instantaneamente por inativação.

`tests/audit.test.mjs`, `tests/uploads.test.mjs` e `tests/audit.spec.mjs` ampliam os testes existentes. Banco/Auth/Storage são reais; somente falhas deliberadas de conexão/trigger são injetadas para verificar rollback/recuperação. O novo fluxo browser cria sua OP pela interface, alterna identidades reais, corrige com retorno autorizado CQ, encerra NC, revisa/aprova/finaliza e verifica PDF/DB; reabre e repete o ciclo preservando versões. Fixtures preservam histórico e desativam perfis no teardown. Suítes de banco e navegador devem rodar em sequência: compartilham a instância e seus testes de contagem não presumem isolamento entre processos externos.

O alerta GHSA-vfj7-8cjw-p6xm está na cadeia de glob do ESLint, usada no desenvolvimento. `npm audit --omit=dev` não reporta vulnerabilidades; o audit completo mantém o aviso sem correção upstream disponível. Não ocultar o aviso nem afirmar conclusão da segurança de produção. Resultado detalhado em TEST_REPORT.md.


Migrations 25–27 alinham campos textuais obrigatórios do fluxo com o backend Zod: motivos de bloqueio/retorno/reabertura, empresa, observação não conforme, resposta TEXT e descrição/tratamento de NC/apontamento rejeitam espaços, tabulações, quebras de linha e whitespace Unicode (inclusive NBSP/BOM). Validação de resposta/observação só reage a medição efetivamente alterada; CQ pode revisar legado sem falsificar/reescrever a medição antiga. O guard roda após conformidade e assinaturas, e falha reverte a transação completa. Campos textuais da NC usam estado explícito do cliente para preservar edição em erro concorrente.

A fixture do teste de dashboard pagina todas as OPs: o limite padrão de 1000 do PostgREST não é usado como total esperado. Agregações da aplicação já eram integrais no PostgreSQL e não foram reescritas. Regressão inclui instância acumulada com mais de 1000 OPs; nenhuma limpeza/reset para mascarar o cenário.

## Contrato de publicação 1.0.0

A aplicação requer runtime Node (Sharp/fontkit/PDF e filesystem de fontes), não Edge. Variáveis de runtime: URL/chave pública Supabase e empresa opcional; não utiliza chave privilegiada. Build inclui fontes locais licenciadas. Migrations completas inicializam o schema sobre uma instalação Supabase real; seed é complementar e não constitui requisito do banco.

DEPLOYMENT.md documenta Supabase + Vercel, homologação, backup de banco e objetos, restauração e atualização. O limite Next.js de 22 MB não supera limites do provedor: na Vercel, payload de Functions de aproximadamente 4,5 MB restringe uploads industriais. Homologação de tempo/memória para relatórios também é obrigatória. Não foi alterado o fluxo de upload nesta revisão documental; hospedagem Node com limites adequados atende ao contrato original de tamanhos.

A versão 1.0.0 consolida os módulos existentes, sem novos recursos. Publicação remota, restauração gerenciada e carga real permanecem validações de operação. Segurança e Deploy não são declarados concluídos enquanto houver as pendências de TEST_REPORT.md.

## Correção controlada e histórico de medições — 1.0.1

Migrations novas 28–31 aplicam-se sobre a instalação existente; nenhuma migration anterior foi alterada:

- `20261008002800_controlled_nc_correction.sql`: checklist_measurements, quality_correction_releases, referências da NC para medições de origem/correção, recuperação de tentativas auditadas, RLS somente leitura para clientes, captura/auditoria de novas tentativas, liberação explícita, deduplicação de NC e snapshot ampliado de PDF.
- `20261008002900_correction_integrity.sql`: texto significativo Unicode, RPC de aprovação/fechamento de correção, FKs compostas medição/item e proteção de referências derivadas.
- `20261008003000_protect_blocking_nc_treatment.sql`: vínculo e caráter impeditivo do problema medido imutáveis para clientes; operador não altera instruções/tratamento de NC impeditiva; requisitos textuais de fechamento também protegidos por trigger.
- `20261008003100_correction_review_states.sql`: revisão de tentativa posterior à abertura durante IN_PRODUCTION, com NC IN_TREATMENT ou AWAITING_QUALITY. Revisão normal de toda a OP continua no fluxo CQ existente.

`checklist_measurements` guarda UUID, OP/item, sequência única por item, tipo/valores, unidade/limites/configuração em snapshot, conformidade, observação/evidência e identidade/horários. FK composta impede relacionar item de outra OP. Índices atendem histórico ordenado, OP/item e ator. Clientes autenticados só SELECT sob `private.can_access_order`; INSERT/UPDATE/DELETE são exclusivos de triggers/manutenção confiável. O estado atual do checklist continua sendo atualizado na mesma transação. Alterações de revisão CQ não geram tentativas fictícias.

Trigger `ab_capture_measurement` roda antes do bloqueio automático: registra a tentativa, depois o bloqueio vincula a NC à medição de origem. Em nova falha, a NC impeditiva aberta do item é reutilizada. A consulta histórica relaciona item/OP à NC; origin_measurement_id identifica o evento inicial e correction_measurement_id a tentativa aprovada no fechamento. A auditoria preserva cada ocorrência e alteração.

`quality_release_correction` é SECURITY INVOKER e chama um helper privado restrito, não exposto no PostgREST, que revalida o perfil ativo CQ/ADMIN, acesso, OP/NC, versão/updated_at e instruções. Ordem de locks: OP → NC. `quality_correction_releases` preserva NC/OP, versão anterior, ator/data, responsável, ação/observação vigentes e estados. Unique OP/versão e o trigger de transição impedem retomada duplicada ou PATCH/genérico sem liberação explícita. Evento, status, auditoria e notificações pertencem à mesma transação; falha desfaz todos.

`quality_close_correction` também é SECURITY INVOKER, trava OP/NC e exige versão/updated_at. `guard_nc` aplica os requisitos mesmo em atualização direta: medição atual conforme posterior à abertura e à última falha, revisão CQ, responsável ativo, ação/observação e liberação rastreável. Vínculo/impedimento não podem ser removidos para contornar fechamento. CQ/ADMIN calcula encerrado_por/data_fechamento/correction_measurement_id. Fechamento não muda o status da OP nem a aprova.

Notificação de liberação vai ao operador responsável; se não definido, aos operadores ativos da linha ativa autorizada. Toda nova tentativa ligada a NC impeditiva aberta notifica QUALIDADE, conforme ou não conforme. Repetir falha bloqueia e exige outra liberação explícita. RPCs existentes do operador conservam RLS, lock de OP/item, cálculo no banco e controle de edição operacional.

Telas alteradas: execução `/operador/op/[id]`, OP CQ `/qualidade/op/[id]` e detalhe `/qualidade/nao-conformidades/[id]`. Componentes MeasurementHistory e CorrectionForm reutilizam sessão real, controle de ação e estilos existentes. Histórico é paginado integralmente; evidência por `/sistema/ordens/[id]/medicoes/[measurementId]/evidencia` exige sessão, OP/medição sob RLS e signed URL de 60s com no-store/no-referrer.

`capture_final_report` inclui todas as tentativas/liberações e seus autores, sem limite PostgREST. Gerador pdf-lib inclui tentativas, snapshots de regras, NC e liberação. Campos novos são opcionais no tipo de snapshot para preservar a retomada de relatórios antigos. Não reescrever arquivos prontos. Recuperação histórica utiliza apenas auditoria e estado já persistidos; dados nunca gravados não são reconstruíveis.
