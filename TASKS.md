# Fases do OP Digital

Consultar PROJECT_SPEC.md antes de iniciar qualquer fase. Base, Banco e autenticação, Administração, PCP, Operador, Controle de Qualidade, Não conformidades, PDF/finalização e Dashboard estão concluídos e validados no Supabase local real. Testes locais e auditoria técnica estão concluídos; Segurança permanece aberta pela pendência upstream de desenvolvimento detalhada em TEST_REPORT.md, e Deploy segue pendente.

- [x] Base
- [x] Banco e autenticação
- [x] Administração
- [x] PCP
- [x] Operador
- [x] Controle de Qualidade
- [x] Não conformidades
- [x] PDF e finalização
- [x] Dashboard
- [ ] Segurança
- [x] Testes
- [ ] Deploy

## Evidência de Banco e autenticação
- Cinco migrations aplicadas, incluindo reconstrução local do banco e correções incrementais.
- Onze entidades, RLS, FKs, índices, enums e updated_at; lint SQL sem erros.
- 19 testes de integração de schema, RBAC/RLS, autoria, auditoria, reabertura e Storage: passaram.
- 10 testes no Chromium de login real, cookies seguros, persistência, logout, proteção, inativação e tablet: passaram.
- Tipos gerados do banco real; TypeScript, ESLint e build de produção: passaram.
- Seed local: 1 ADMIN, 1 PCP, 1 QUALIDADE, 2 OPERADORES, 2 linhas, 3 produtos, 3 modelos e 13 itens.
- Nenhuma aplicação remota das migrations ou deploy realizado. Não há interface dos módulos de produção/qualidade futuros.

## Evidência de Administração
- Sexta migration aplicada incrementalmente, sem reset dos dados existentes; lint SQL passou.
- Quatro páginas administrativas, layout desktop/tablet, pesquisa/paginação, formulários e estados compartilhados.
- CRUD com desativação/reativação, profile sem alteração de senha/Auth, duplicação e nova revisão de modelos.
- Transação de checklist preserva itens aposentados e snapshots das OPs; concorrência detectada por updated_at.
- Permissão ADMIN no proxy, layouts, ações, RPC e RLS. PCP/CQ/OPERADOR não mantêm catálogo nem acessam páginas ADMIN. Exclusão física revogada.
- 13 testes administrativos no PostgreSQL e 12 no Chromium passaram; 19 testes RLS/Storage e 10 de Auth passaram como regressão (54 no total, sem testes ignorados).
- TypeScript, ESLint e build de produção passaram. Corrigidos redirect de Server Actions após revogação e seed diante do índice parcial.
- Validação exclusivamente local; nenhum deploy/migration remota.

## Evidência de PCP
- Rotas dashboard/lista/nova/detalhes, layout compartilhado e acesso somente ADMIN/PCP.
- Dashboard com oito contagens PostgreSQL e tabela paginada/pesquisável, com todos os filtros solicitados.
- Criação real DRAFT, número único, data/hora São Paulo e PDF original privado validado até 20 MB; signed URL no clique.
- Preparação transacional DRAFT → PREPARING → RELEASED, snapshot completo e metadados do modelo, sem duplicação e com auditoria real.
- Sétima/oitava migrations aplicadas sem reset, com correção do lock de catálogo sob RLS; sem conceder manutenção ao PCP.
- 12 testes PCP no banco + 12 no Chromium passaram: fluxo completo, concorrência, falha no segundo item, rollback integral, vínculo/PDF, recuperação de upload, permissões, filtros e tablet.
- Regressões passaram: 19 RLS/Storage, 13 ADMIN no banco, 12 ADMIN browser e 10 Auth browser. Total validado: 78 testes, sem mocks.
- TypeScript, ESLint, lint SQL e build passaram. Documentadas transação de preparo e diferença entre banco/Storage.
- Escopo PCP concluído é criação, consulta e preparação/liberação. Finalização/reabertura na UI e relatório pertencem às etapas posteriores.
- Validação exclusivamente local; nenhum deploy/migration remota.

## Evidência de Operador
- Rotas Minhas OPs/execução, cards grandes, cabeçalho fixo, PDF/evidência assinados e formulários sem tabelas largas.
- Acesso somente OPERADOR ativo, por atribuição/linha ativa; proxy, página, ações, RPCs e RLS. POST em outra rota também revalida perfil.
- Migrations 9–11 aplicadas incrementalmente sem reset; tipos gerados e lint SQL passou. Novos enums, NC impeditiva e validação de apontamentos diretos.
- Início com lock/versão/ator/horário e auditoria; cinco tipos de checklist calculados no banco; observação obrigatória não conforme e evidência privada até 10 MB.
- Bloqueio, NC CHECKLIST, notificação CQ e auditoria atômicos; falha real na criação da NC reverte toda a operação. Operador não remove impedimento.
- Sete tipos de apontamento com opcionais/foto/autor/horário; envio exige obrigatórios, quantidades inclusive perdas zero e ausência de itens/NCs impeditivos.
- Formulários preservados em erro; recuperação textual explícita de sessionStorage após refresh/conexão interrompida, sem registro oficial ou arquivos no navegador. Limpeza após sucesso/logout corrigida para ocorrer antes do refresh.
- 13 testes de integração do operador e 12 Chromium passaram. Regressões: 44 testes de banco anteriores e 34 browser. Total daquela fase: 103 cenários, zero falhas/ignorados, sem mocks.
- TypeScript, ESLint, lint SQL e build passaram. Tablet testado em 768×1024, 1024×768 e 600×768, com controles amplos/cabeçalho visível/sem overflow.
- Ajustadas fixtures RLS à regra nova: não conforme exige observação; envio exige quantidades e nenhuma NC impeditiva aberta. Critérios continuam exercitados por testes negativos próprios.
- Sem UI de tratamento CQ/NC, finalização administrativa ou relatório. Validação exclusivamente local; sem migration remota/deploy.

## Evidência de Controle de Qualidade e Não conformidades
- Rotas dashboard/fila/detalhes CQ e lista/detalhes NC, navegação e layout compartilhado, pesquisa/filtros/paginação e tablet.
- Quatro indicadores reais e fila com OP/produto/lote/linha/operador/status/horário de envio. Revisão exibe esperado/medido/conformidade/autor/data/observação/evidência e destaca itens configurados.
- Revisão preserva medição/autoria e registra CQ/horário reais. Aprovação somente AWAITING_QUALITY após critérios; APPROVED/AWAITING_PCP com assinatura/notificação/auditoria atômicas. Reprovação exige motivo, REJECTED/BLOCKED_QUALITY e notificação aos destinatários autorizados.
- Máquina de estados centralizada no PostgreSQL, aplicada também no PATCH direto e para ADMIN. Retorno controlado a produção/revisão exige justificativa e critérios; preserva medições e rastreabilidade, sem transição arbitrária.
- NC com código anual sequencial concorrente, legado preservado, enums atuais, campos completos, evidências privadas antes/depois, histórico e autoria. Fechamento exige fluxo/ação/responsável ativo/observação; cancelamento exige justificativa; terminais não editáveis/excluíveis.
- NC já não impeditiva pode terminar tratamento em AWAITING_PCP sem abrir nova NC, reclassificar impedimento ou alterar aprovação da OP.
- Migrations 12–16 aplicadas incrementalmente sem reset; tipos gerados da instância real. Storage privado e documento com vínculo/RLS/signed URL 60s; nenhum service_role no runtime.
- Corrigidos re-bloqueio ao limpar revisões, aceitação indevida de NULL na aprovação final, assinatura forjada por ADMIN e nome acessível de textarea na edição. Testes browser esperam o estado persistido, sem confundir opção selecionada/loading com sucesso.
- 16 integrações CQ/NC e 16 testes Chromium novos passaram. Regressões: 57 testes de banco e 46 Chromium anteriores. Total daquela fase: **135 cenários (73 banco + 62 navegador), zero falhas/ignorados, sem mocks**.
- Testes cobrem todos os pares de transições CQ/NC válidas e inválidas, critérios de aprovação/fechamento, API direta e Server Action em outra rota, usuários sem permissão/inativos, concorrência, rollback de decisão ao falhar notificação, ciclo de bloqueio automático/correção/fechamento/aprovação e documentos/tablet.
- TypeScript, ESLint, lint SQL e build de produção passaram. Validação exclusivamente local; nenhum deploy/migration remota. PDF/finalização, dashboard geral, segurança/testes gerais e deploy permanecem pendentes.

## Evidência de PDF, finalização, auditoria e reabertura
- FINALIZAR OP somente AWAITING_PCP/CQ APPROVED na UI PCP/ADMIN; backend valida estado/versão/CQ, execução/fim/quantidades, checklist/revisões e NCs impeditivas. Aprovação PCP migra para enum APPROVED/REJECTED/null, com assinatura e horário reais.
- Nome da empresa obrigatório, opcionalmente preenchido por variável server-only. Snapshot integral de OP/produto/linha/checklist/notas/NC/nomes/aprovações criado na mesma transação; falha reverte finalização inteira.
- final_reports com RLS por OP, registry/snapshot imutáveis, UUID/versão/caminho por finalização, PENDING/READY e metadados SHA256/páginas/combinação. Storage privado até 40 MB, somente caminho emitido, sem overwrite/delete inclusive ADMIN.
- Gerador Node com pdf-lib/fontkit e Open Sans licenciada/tracing na build. PDF contém todos os campos, geração em São Paulo, paginação, texto longo/unicode e original anexado quando compatível; original incompatível permanece separado e intacto.
- Falha de geração/upload/vínculo tem pendência explícita e retomada PCP/ADMIN; upload prévio é reaproveitado byte a byte. Reabertura aguarda relatório pronto. Nova finalização gera outro PDF sem substituir versões anteriores; ponteiro atual fica pendente até vínculo.
- ADMIN ou profile ativo com flag e acesso à OP reabre com motivo/versão; limpa aprovações/revisões/fim/envio e preserva medições/histórico/relatórios. Operador retoma, CQ revisa/aprova e PCP finaliza nova versão. OP e filhos FINALIZED são imutáveis inclusive ADMIN.
- Auditoria automática garante eventos de criação/planejamento/preparo/início/medição/alteração/NC/aprovação/reprovação/finalização/reabertura/relatório, sem escrita/exclusão pelo cliente. Consulta completa PCP/ADMIN paginada em 50, com atores/antes/depois.
- Remetente real do operador é capturado da auditoria de envio ao CQ, sem confundir com responsável planejado ou retorno CQ; testado com usuários distintos da linha autorizada.
- Migrations 17–21 aplicadas incrementalmente sem reset; tipos reais gerados; lint SQL/TypeScript/ESLint/build de produção passaram. Nenhuma credencial real no código, segredo no cliente ou service_role no runtime.
- 13 integrações desta fase e 10 Chromium passaram; regressões 73 banco e 62 Chromium anteriores. Total atual: **158 cenários (86 banco + 72 navegador), zero falhas/ignorados, sem mocks de banco/Auth/Storage**.
- PDF real baixado/reaberto via pdf-lib, pdfinfo e pdftotext; renderizado por pdftoppm e inspecionado visualmente. Mais de 1000 apontamentos inseridos no PostgreSQL foram capturados integralmente e incluídos no PDF; original inválido não corrompe relatório. Fonte incorporada não depende de download em runtime.
- Testados API/bypass de Server Action, autoria, perfis sem permissão/inativos, concorrência, rollback de snapshot, falha após upload/retomada, arquivos privados, imutabilidade, reabertura PCP/ADMIN/CQ/OPERADOR com autorização e duas versões preservadas; viewport tablet 768×1024.
- Corrigidos política com sombra do argumento path, subset incompatível da fonte, rodapé após save e fixture de Auth invalidada por logout global. Validação exclusivamente local; sem migration remota/deploy. Etapas gerais de Dashboard/Segurança/Testes/Deploy continuam pendentes.

## Próxima etapa
Resolver a pendência upstream de Segurança registrada em TEST_REPORT.md e planejar Deploy/homologação. Testes gerais locais foram concluídos nesta auditoria. Preservar fluxos, RLS, snapshots/relatórios/auditoria e versões; não antecipar etapas sem solicitação.

## Evidência de Dashboard, navegação e usabilidade
- Migration 22 aplicada ao Supabase local existente, sem reset, com agregação integral SECURITY INVOKER/RLS e perfis ativos. Tipos gerados e lint SQL sem erros.
- PCP: oito cards e cinco gráficos solicitados; CQ: indicadores e gráficos de severidade/produto/parâmetros/conformidade. Campos de data nativos e período validado no servidor e PostgreSQL; fila CQ operacional permanece completa.
- Sem novas dependências; dados reais. Quantidades por unidade e definição de conformidade documentadas; sem amostragem limitada da API.
- Layout e tokens compartilhados preservados, PCP em cards em tablet/tabela desktop, navegação ativa nas rotas filhas, breadcrumbs, foco/atalho de conteúdo, diálogo limitado à viewport e feedback de sucesso acessível com fechamento explícito.
- Testados 768×1024 e 800×1280 em PCP/CQ/operador/admin: sem overflow horizontal, gráfico/lista/filtros/menu, diálogos dentro da tela, cards e execução. Desktop mantém tabela e navegação. Capturas de PCP/CQ inspecionadas visualmente.
- Toque simulado confirmou pointer:coarse e inputs/botões de pelo menos 56 px nos dois tamanhos. Status mantêm texto além de cor; interface sem animações acrescentadas.
- **74 cenários passaram (72 na regressão final + 2 de toque), zero falhas/ignorados**: 12 novos cenários de dashboard/UX, incluindo comparação de totais/unidades no PostgreSQL, NC real, datas inválidas, acesso anônimo/OPERADOR/inativo recusado e toast funcional; 62 regressões de Administração/PCP/Operador/CQ/NC/finalização/PDF.
- TypeScript, ESLint, lint SQL e build de produção passaram. Corrigida a agregação de itens CQ para preservar a regra existente; teste de contagens atualizado para formato numérico pt-BR. Testes de navegação usam o nome da navegação principal para distinguir breadcrumbs.
- Etapa Dashboard concluída apenas localmente; sem migration remota/deploy. Segurança/Testes gerais/Deploy seguem pendentes.

- ESLint ignora diretórios de resultados gerados do Playwright: corrigida uma corrida de leitura ao executar lint junto do teste, sem excluir fontes ou testes da análise.


## Evidência de auditoria técnica e Testes — 08/10/2026
- Revisadas autenticação, autorização/RLS, Server Actions/rotas, uploads/URLs, validação, estados, auditoria, PDF, SQL/tipos/erros, concorrência e duplicação. Correções aplicadas, sem módulos novos.
- Migrations 23–27 aplicadas incrementalmente, sem reset; 27 migrations no catálogo real. Storage também protege ADMIN, originais imutáveis, definições liberadas imutáveis/autoria protegida, liberação exige PDF existente, DELETE de histórico revogado, índices/constraints/whitespace ASCII e Unicode corrigidos. Revisões de legado preservadas.
- Uploads parseiam PDF e decodificam imagens reais com extensão/MIME/tamanho/pixels/tempo; fixture PNG corrigida. Retomada compara versão exata; no-referrer preservado. Campos de NC mantêm estado em erro concorrente; teste de totais pagina bases acima de 1000 OPs.
- **193 cenários distintos passaram: 107 Node/banco/arquivos + 86 Chromium, zero falhas/ignorados.** Preservação do formulário concorrente de NC passou em cinco repetições adicionais.
- Fluxo completo realmente executado pela UI/Auth real até FINALIZED, com PDF anexado/preparo/medições/bloqueio/NC/correção autorizada/tratamento/revisões/aprovações. Reabertura e novo ciclo pela UI mantiveram dois relatórios privados e terminaram novamente FINALIZED. Banco e hashes conferidos.
- PDF real aberto, extraído, renderizado e inspecionado; três páginas com relatório/NC/aprovações e original. RLS/APIs/Storage/actions tentados pelos quatro perfis; operador não planeja, altera limites, aprova CQ, finaliza PCP ou acessa OP/arquivo alheio.
- Tipos reais, typecheck, ESLint, lint SQL e build passaram. npm test/test:unit/test:audit tornam a verificação sequencial e reproduzível.
- npm audit --omit=dev: zero vulnerabilidades. Audit completo mantém cinco entradas altas da cadeia dev do ESLint (GHSA-vfj7-8cjw-p6xm), sem patch disponível; Segurança não marcada como concluída. Limites de Storage direto/URLs bearer e ambiente local estão em TEST_REPORT.md.
- Testes concluídos localmente; sem aplicação remota/deploy. Relatório completo: TEST_REPORT.md.

## Entrega 1.0.0 — 08/10/2026

- README, ARCHITECTURE, CHANGELOG e exemplo de ambiente consolidados; DEPLOYMENT e USER_GUIDE criados.
- Instalação nova isolada, sem seed e sem reset da instância existente: 27 migrations aplicadas, 12 tabelas com RLS, quatro buckets privados, nenhuma constraint pública não validada. Lint SQL da instância nova passou.
- Auth real na instalação limpa criou profile OPERADOR inativo; consultas anônimas e escrita do usuário inativo foram recusadas. Leitura RLS de usuário inativo retornou conjunto vazio, conforme o contrato PostgreSQL.
- Removidos três exports sem referências e quatro .gitkeep de diretórios preenchidos. Sem console.log/TODO/mock no frontend; seeds e dependências efetivamente necessárias preservados.
- Publicação e recuperação remotas não foram executadas. Limite de payload Vercel abaixo dos uploads industriais documentado; Segurança e Deploy seguem abertos.

- Verificação final 1.0.0: instalação pelo lockfile, typecheck, ESLint, build e **193 testes aprovados (107 Node + 86 Chromium), sem falhas/ignorados**. Última alteração textual da homepage conferida por smoke HTTP e nova build. Dois PDFs privados preservados, hashes/parsing válidos e estado FINALIZED confirmados.
- Pacote de fonte/documentação `op-digital-v1.0.0.zip` gerado e conferido, sem dependências instaladas/build/credenciais/temporários. Publicação, homologação de limites e recuperação remota continuam pendentes.

## Correção de NC impeditiva — 1.0.1

- [x] Migrations incrementais 28–31, histórico append-only, RLS/FKs/índices e recuperação de tentativas persistidas; nenhuma migration antiga editada.
- [x] IN_TREATMENT mantém bloqueio; ação explícita CQ/ADMIN LIBERAR PARA CORREÇÃO com confirmação, requisitos, locks, ator/data/instruções e notificação transacional.
- [x] Novas medições preservam tentativas/regras; falha bloqueia/reutiliza NC, conformidade aguarda revisão e não fecha automaticamente.
- [x] Revisão/fechamento de NC exige nova medição conforme válida e CQ; fechamento não aprova a OP. Permissões operacionais não ampliadas.
- [x] Operador/CQ/NC exibem aviso, instruções e histórico; evidências privadas e PDF com todas as tentativas/liberações.
- [x] Cinco casos novos de banco, incluindo RBAC/concorrência/rollback/snapshots; regressão Node 112/112 aprovada.
- [x] Validação final Chromium das duas novas suítes e regressão integral: 88/88 aprovados, zero falhas/ignorados; fluxo completo e reabertura preservados.
- [x] Instalação limpa isolada sem seed: 31 migrations, 14 tabelas RLS, quatro buckets privados, FKs validadas e histórico sem grants de escrita de clientes. Auth real/inativo e lint SQL passaram; instância principal preservada.
- [x] Typecheck, lint, SQL e build de produção aprovados; documentação do contrato atualizada.

**Resultado final: 200 cenários (112 Node + 88 Chromium), typecheck, lint, SQL e build aprovados.** PDF com 3650/3350 aberto e inspecionado; cinco PDFs anteriores conferidos por hash/páginas/UUID. Resultados em TEST_REPORT.md. Publicação/migrations remotas continuam pendentes; o ZIP/tag 1.0.0 permanece histórico dessa versão.
