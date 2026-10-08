# OP Digital — relatório de auditoria técnica

Data: 08/10/2026. Versão corrigida: 0.8.1.

## Resultado final

**193 cenários distintos aprovados: 107 testes Node (banco/arquivos) e 86 Chromium, sem falhas, testes ignorados ou mocks de Auth/PostgreSQL/Storage.** O teste de preservação de texto em erro concorrente de NC passou também em cinco repetições adicionais. Typecheck, ESLint, lint SQL e build de produção passaram.

O fluxo completo foi executado pela interface com usuários Auth reais. Incluiu PDF original, preparação, medição conforme e não conforme, bloqueio/NC automática, correção autorizada pelo CQ, tratamento/fechamento, revisões, aprovações e finalização. O PDF foi baixado, parseado, extraído e renderizado; reabertura e segunda finalização preservaram ambos os PDFs e terminaram em FINALIZED.

Não há falhas confirmadas abertas nos cenários da aplicação testados. **Há uma pendência externa de segurança na cadeia de desenvolvimento do ESLint, sem patch upstream disponível**, detalhada abaixo. Não é uma aprovação de segurança ou deploy de produção. Nenhuma funcionalidade de negócio nova foi adicionada.

## Ambiente e metodologia

- Repositório existente, com PROJECT_SPEC.md, ARCHITECTURE.md e TASKS.md lidos antes da auditoria.
- Next.js 16.4.0/React 19.3.0, Node 24, TypeScript 6, build Webpack; Chromium real.
- Supabase local real em Docker, PostgreSQL/Auth/Storage, projeto op-digital. Aplicação testada em build de produção, 127.0.0.1:3100.
- Migrations 23–27 aplicadas incrementalmente; catálogo confirma **27 migrations** aplicadas. Instância existente e histórico preservados, sem reset nesta auditoria. Não reconstruído um projeto remoto ou outro cluster limpo nesta fase.
- Perfis/linhas/produtos/modelos das fixtures são provisionados por manutenção confiável. As operações sob teste usam JWTs reais dos respectivos usuários ou Server Actions autenticadas; cliente privilegiado é usado para setup/verificação, não para simular aprovação dos testes de permissão.
- Fixtures preservam registros auditáveis e desativam seus perfis ao terminar. Instância acumulada ultrapassou 1.000 OPs, exercitando leitura integral nos testes de totais.
- SQL e navegador rodam em sequência; alterações externas simultâneas nas fixtures invalidam comparações pontuais de contagem. Falhas de conexão/trigger são injetadas explicitamente apenas para verificar recuperação/rollback.

## Comandos executados

| Verificação | Comando | Resultado |
|---|---|---|
| Migrations pendentes | `npm run supabase -- migration up --local` | 23–27 aplicadas sem reset |
| Tipos do banco | `npm run db:types` | Gerados do PostgreSQL real |
| SQL | `npm run db:lint` | No schema errors found |
| TypeScript | `npm run typecheck` | Passou |
| ESLint | `npm run lint` | Passou |
| Produção | `npm run build` | Passou |
| Banco e arquivos | `npm run test:unit` | 107/107 |
| Navegador | `npm run test:browser` | 86/86 |
| NC concorrente | `npx playwright test quality.spec.mjs --grep 'edição concorrente' --repeat-each=5` | 5/5 |
| Dependências runtime | `npm audit --omit=dev --json` | 0 vulnerabilidades |
| Dependências completas | `npm audit --json` | 5 entradas altas da mesma cadeia dev; sem fixAvailable |
| PDF | pdf-lib, `pdfinfo`, `pdftotext`, `pdftoppm` e inspeção visual | Íntegro, conteúdo/páginas/hash conferidos |

`npm test` foi adicionado para reproduzir os dois grupos em sequência. `npm run test:audit` executa os novos casos de auditoria/arquivos e o fluxo browser, com build atual.

### Cobertura automatizada

| Grupo | Node | Chromium |
|---|---:|---:|
| RLS/schema/Auth/Storage inicial | 19 | 10 |
| Administração | 13 | 12 |
| PCP | 12 | 12 |
| Operador | 13 | 12 |
| CQ e NC | 16 | 16 |
| Finalização/PDF/reabertura | 13 | 10 |
| Dashboard/tablet/toque | — | 12 |
| Auditoria adicional | 15 | 2 |
| Parsing/decodificação de arquivos | 6 | — |
| **Total** | **107** | **86** |

São 23 cenários novos, além da regressão existente. Os testes exercitam valores limítrofes, dados inválidos, conflitos de versão/updated_at, transições válidas/ inválidas, callbacks em rota alternativa e APIs diretas; não se limitam a botões escondidos.

## Problemas encontrados e correções

| Problema reproduzido/observado | Correção e reteste |
|---|---|
| PCP/ADMIN conseguiam sobrescrever original pelo Storage, inclusive original arquivado com override ADMIN. | Removida policy UPDATE. Novo original em rascunho usa outro objeto; overwrite negado para ambos os perfis. |
| ADMIN enviava originais/evidências depois de FINALIZED. | Helper Storage aplica estado/role/bucket inclusive ADMIN; apenas caminho emitido de relatório pendente permanece permitido. |
| ADMIN conseguia falsificar autor/dados da medição e alterar limites de snapshot liberado. | Guard de integridade limita colunas e torna definições liberadas imutáveis. API direta nega autoria/respostas/limites indevidos. |
| Snapshot aceitava NaN/configuração BOOLEAN inválida e opções SELECT duplicadas, apesar do modelo ser validado. | Mesmo validador de definição aplicado ao snapshot; insert medido/revisado também recusado. |
| PCP podia liberar por PATCH com path de PDF inexistente e um item manual. | Trigger verifica objeto privado existente, MIME/tamanho e vínculo à própria OP na liberação. |
| ADMIN podia excluir fisicamente medições/apontamentos antes de finalizar. | DELETE de OP/checklist/apontamentos revogado para authenticated; histórico preservado. |
| Cabeçalho de imagem/PDF e MIME declarado eram insuficientes para verificar conteúdo real; extensões de evidência não eram conferidas. | Validador compartilhado: extensão/MIME, parsing PDF com páginas, decodificação JPEG/PNG/WebP, 20 megapixels/timeout de 5s e limites de bytes. Falsos, truncados, vazios e dimensão excessiva negados. |
| Retomada de PDF aceitava versão com prefixo semelhante, por exemplo 1/10. | Keywords comparadas como tokens exatos; UUID/páginas/parsing/40 MB conferidos; arquivo incompatível permanece pendente, sem overwrite. |
| Campos obrigatórios eram satisfeitos apenas por tabulação/quebra de linha e whitespace Unicode pela API, apesar de Zod recusá-los. | Guards após regras de negócio cobrem campos obrigatórios do fluxo, NBSP/BOM e whitespace ECMAScript. Falha reverte medição/bloqueio/NC; revisões legadas sem alteração da resposta continuam permitidas. |
| Índices de FKs/consulta faltavam para notificações completas, atores de relatório/encerramento e itens aposentados. | Índices integrais adicionados. Índice parcial de itens ativos preservado; teste de catálogo verifica prefixo integral das FKs. |
| Texto da NC apresentou concatenação com valor inicial em cenário de erro concorrente. | Textareas passam a ter estado explícito do cliente; cenário passou cinco vezes e na regressão completa, mantendo banco e texto local separados. |
| Cabeçalho global acrescentado na auditoria substituía no-referrer da rota PDF por same-origin. | Política global alinhada para no-referrer; testada no redirect real. |

### Correções no próprio conjunto de testes

- Fixture PNG antiga falhava na decodificação libpng; substituída por PNG real. Não foi afrouxado o parser.
- Fixture histórica de Storage ajustada: setup privilegiado pode preparar documento histórico; ADMIN comum passa a ser explicitamente impedido de escrever depois da liberação. PDFs de teste agora são reais.
- Esperado do dashboard era truncado em 1.000 linhas pelo PostgREST. Teste pagina toda a base; a agregação da aplicação já era integral e não foi reescrita.
- Execução concorrente de suítes compartilhando a instância causava divergência de contagens. Scripts finais executam os grupos em sequência, sem apagar dados.
- O primeiro guard de texto também recusava revisão CQ de medição legada preservada. Reteste detectou a regressão; migration 27 restringe a validação de resposta/observação a alterações reais de medição, mantendo revisão/retorno do legado.

## Autorização verificada no backend

| Perfil | Ações verificadas |
|---|---|
| OPERADOR | Acesso apenas à atribuição/linha autorizada ativa; outra OP oculta também em filhos/arquivos. Não altera planejamento/limites, aprova CQ/finaliza PCP, falsifica autoria ou cria NC não impeditiva para contornar o fluxo. RPC/PATCH/Storage e Server Action em outra rota negam as tentativas. |
| PCP | Cria/prepara/anexa/finaliza dentro de estados/critérios; não mede como operador, revisa/aprova CQ ou mantém catálogo administrativo. Não sobrescreve original/relatório nem libera sem PDF existente. |
| QUALIDADE | Revisa/trata/decide com assinatura própria, critérios e transições controladas; não altera planejamento/medição/limites, acessa rascunho ou finaliza PCP. |
| ADMIN | Mantém catálogo/perfis e executa PCP/CQ, assinando como si próprio. Não falsifica operador, altera snapshot liberado, edita FINALIZED, sobrescreve arquivos ou apaga histórico. Reabertura válida preserva arquivos/medições. |
| Anônimo/inativo | Sem acesso a registros/documentos. Token anteriormente válido perde novas leituras/escritas/emissões após inativação; vínculo e RLS continuam obrigatórios. |

Todas as 12 tabelas públicas têm RLS. Constraints estão validadas; FKs têm índices integrais de prefixo, incluindo histórico. Helpers definer em public/private possuem search_path vazio e EXECUTE negado a anon. Views invoker preservam RLS. Logs/registro de relatório não aceitam escrita arbitrária pelo cliente. Não há service_role no runtime da aplicação ou segredo exposto ao frontend.

Signed URLs autorizadas foram baixadas de verdade; URL com TTL de 1s expirou de fato. Links gerados pela rota da aplicação tiveram TTL de 60s, private/no-store/no-referrer, com vínculo OP/registro. Código inválido, OP alheia e arquivo privado estrangeiro não foram expostos.

## Fluxo completo e evidência do PDF

1. Login PCP real; criação pela UI com produto/linha/operador/lote/quantidade e PDF verdadeiro.
2. Banco confirma DRAFT, autor PCP e original privado. Preparação pela UI confirma RELEASED e seis snapshots completos.
3. Login operador; início registra IN_PRODUCTION/horário. Diâmetro 10 mm é conforme; 8 mm com observação cria NC impeditiva, notificação e BLOCKED_QUALITY.
4. **Antes da correção, CQ autentica e autoriza retorno à produção.** Operador não burla o bloqueio. Operador corrige para 10 mm, preenche BOOLEAN/SELECT/TEXT/PHOTO/NUMBER e registra apontamento.
5. Envio com NC aberta é recusado pela API, apesar da medição corrigida. CQ trata OPEN → IN_TREATMENT → AWAITING_QUALITY → CLOSED, com ação/responsável/observação/evidência e encerramento aprovado.
6. Operador envia 98 produzidas/2 perdidas e observação, gerando AWAITING_QUALITY/fim/notificação.
7. CQ revisa os seis itens e aprova, gerando AWAITING_PCP/APPROVED/ator/data.
8. PCP finaliza e gera relatório privado READY. Banco confirma FINALIZED, duas aprovações, atores/horários, path/hash/páginas.
9. PDF baixado via rota autenticada, aberto por pdf-lib/pdfinfo, texto extraído e páginas renderizadas/inspecionadas. Contém dados/limites/valores/NC/apontamento/aprovações e original anexado; SHA256 confere.
10. ADMIN reabre com motivo. Banco confirma REOPENED, aprovações/revisões resetadas e relatório antigo preservado byte a byte. Operador reinicia/envia; CQ revisa/aprova novamente; PCP finaliza nova versão. Ambos os relatórios são reabertos/verificados, com hashes e caminhos distintos; status final novamente FINALIZED.

A versão da OP é o contador de concorrência existente; as duas finalizações abaixo usam versões 10 e 15, não necessariamente 1/2.

Evidência preservada da auditoria 0.8.1 (nova execução 1.0.0 registrada abaixo):

- OP: **OP-AUDIT-15bce54a-887f-46b4-ac33-7ac4d69fc43c**; UUID `faa9d0ad-9619-4ff8-9ea5-3c68c1b843f0`.
- NC: **NC-2026-00431**, fechada/aprovada CQ.
- Relatório inicial: `fe49c872-5607-4f5b-970c-fbc5a4009541`, três páginas (duas de relatório + uma original), SHA256 `9cb3bb97f9a71c747009978b4adaefb19d3d0b80cef29fda4a7d3d6aaed49d2f`.
- Versões preservadas: **10, 15**; estado final confirmado **FINALIZED**.
- Auditoria anterior à reabertura: **350 eventos por campo**; o próprio banco conserva também reabertura, novo ciclo e segunda finalização.
- Artefatos locais reproduzíveis: `/tmp/op-digital-audit-flow.pdf`, `/tmp/op-digital-audit-flow.png`, `/tmp/op-digital-audit-flow.json`. O JSON contém identificadores/hash, sem senhas/tokens/URLs assinadas.

## Limitações conhecidas e pendências

1. **Alerta externo dev:** GHSA-vfj7-8cjw-p6xm, braces ≤3.0.3, exaustão de pilha por padrões muito aninhados. Audit reporta cinco entradas altas encadeadas: braces → micromatch → fast-glob → @next/eslint-plugin-next → eslint-config-next. Registro consultado não tinha versão corrigida, e fixAvailable=false. Usado por configuração de glob do lint no desenvolvimento, sem entrada de usuário da aplicação; `npm audit --omit=dev` confirma zero vulnerabilidades runtime. Não foi ocultado com exclusão do audit ou substituição não verificada. Fase Segurança permanece pendente até tratar/documentar a resolução upstream e validar produção.
2. **Bytes pela API Storage:** validação estrutural real ocorre nas Server Actions. RLS/PostgreSQL/buckets verificam acesso, extensão/caminho, metadata MIME/tamanho e existência, sem interpretar bytes. Usuário autorizado à API Storage pode declarar MIME de bytes enviados diretamente. Não há antivírus/desarme de PDFs ou atestação independente. Cabeçalhos do host Storage não são controlados por next.config.ts.
3. **URLs bearer:** links já emitidos permanecem válidos até expirar; desativação não os revoga instantaneamente. TTL 60s aplica-se às emissões da aplicação. Clientes autorizados da API Storage podem escolher outros TTLs; cópias já baixadas não são revogáveis.
4. **PostgreSQL/Storage:** não há transação distribuída. Erro posterior ao upload pode deixar objeto privado não vinculado; retenção/limpeza não é automática. Falha de relatório tem PENDING explícito, retomada sem overwrite e impedimento de reabrir até concluir. Arquivo incompatível preexistente exige manutenção confiável.
5. **PDF:** combinação não preserva assinatura criptográfica do PDF original; original permanece intacto e separado quando incompatível. SHA256 identifica bytes, não é assinatura digital ou prova independente de conteúdo. Evidências fotográficas são referenciadas por path; não foram introduzidas novas funcionalidades de laudo.
6. **Escopo de ambiente:** testes locais reais, incluindo tablets 768×1024/800×1280, toque, desktop e carga de dados acumulada. Não houve teste de infraestrutura hospedada/TLS/proxy, restauração de backup, carga sustentada ou deploy. Não apagar histórico para repetir os testes.

A etapa Testes está concluída **para esta validação local**. Segurança permanece aberta pela pendência explicitada, e Deploy não foi executado.

## Revisão de entrega 1.0.0 — 08/10/2026

Instalação limpa validada em Supabase real isolado (`op-digital-release-clean`, portas distintas), com seed desabilitado: as 27 migrations construíram o banco, 12 tabelas públicas com RLS e quatro buckets privados. Produtos e profiles estavam vazios antes do teste Auth. Não havia constraints públicas não validadas. Lint SQL passou nas instâncias existente e nova. Auth real criou profile OPERADOR inativo e as permissões recusaram anônimo/escrita inativa. O primeiro assert de leitura inativa esperava erro 42501; foi corrigida a expectativa do teste manual para conjunto vazio RLS, sem alteração da aplicação. Instância de teste foi parada e seus próprios volumes removidos; banco existente preservado.

Limpeza: removidos `dashboardSchema`, `SearchBar` e `ROLES` sem referências, e quatro arquivos .gitkeep obsoletos. Dependências de produção revisadas; React DOM é requerido pelo Next mesmo sem import direto. Seeds reais locais preservados. Versão 1.0.0 no manifest e lockfile; documentação operacional/guia/exemplo de ambiente completos.

Novas limitações explicitadas: Vercel Functions limita payload a aproximadamente 4,5 MB; a configuração Next de 22 MB não garante upload de PDF de 20 MB nessa infraestrutura. Homologar tamanhos e geração de PDF ou adotar hospedagem Node adequada. Backup de PostgreSQL não inclui bytes de Storage; restauração gerenciada/remota permanece sem ensaio. Avisos Node de detecção de módulo e npm de ESLint em fim de suporte não são erros de typecheck/lint/build.

Audit atualizado: dependências de produção com zero vulnerabilidades; audit completo conserva cinco entradas altas da cadeia dev ESLint, sem correção disponível na árvore atual. Não declarado como segurança concluída.

### Resultado final da entrega

| Verificação | Resultado |
| --- | --- |
| `npm ci` com lockfile 1.0.0 | Aprovado (397 pacotes) |
| Migrations em Supabase novo sem seed | 27 aplicadas, lint SQL aprovado |
| `npm run typecheck` | Sem erros |
| `npm run lint` | Sem erros |
| `npm test` | 193 aprovados: 107 Node/banco/arquivos + 86 Chromium; zero falhas/ignorados |
| `npm run build` após limpeza e correção da homepage | Aprovado |
| Smoke da build final | Homepage atualizada e ADMIN anônimo redirecionado ao login |
| Dois relatórios privados após reabertura | READY, hash SHA256 e parsing válidos, três páginas cada |

A suíte completa foi repetida após remover exports sem uso. Depois, a única alteração de interface foi substituir o texto obsoleto da página pública; typecheck/lint/build foram repetidos e a resposta HTTP da build final foi conferida. Não houve alteração de regras de negócio.

Execução 1.0.0: OP `OP-AUDIT-b37038e4-aea5-46a9-ab94-96fac1899510`, UUID `ca3ce9ec-c98e-44a5-8b20-9fd7b8f00c52`, NC `NC-2026-00497`. Estado final confirmado `FINALIZED`; versões de relatório 10 e 15 preservadas. PDF atual baixado novamente do Storage privado e aberto por pdf-lib/Poppler (`/tmp/op-digital-release-final.pdf`). Artefatos temporários são evidência local e não integram o pacote.

Pacote: `op-digital-v1.0.0.zip`, com fonte, testes, migrations, seeds úteis, configurações e documentação; sem node_modules, .next, .git, ferramentas locais, credenciais, .env real ou resultados temporários. CRC e conteúdo conferidos durante a geração. Limitações e pendências de Segurança/Deploy permanecem explícitas.
