# Changelog

## 1.0.0 — 08/10/2026

- Consolidação dos módulos existentes e documentação final, sem novos recursos de negócio.
- README reestruturado para instalação, configuração, migrations, primeiro ADMIN, seed, execução e validação.
- DEPLOYMENT.md com Supabase/Vercel, limites de payload/geração PDF, backup separado de Storage, restauração e atualização.
- USER_GUIDE.md para PCP, Operador, Qualidade e Administrador; exemplo de ambiente completo sem credenciais.
- Tela inicial descreve os módulos disponíveis, removendo o aviso obsoleto de futuras fases.
- Revisão de limpeza, dependências e arquitetura; pacote de código-fonte 1.0.0 sem builds, ferramentas locais ou segredos.
- Evidências finais de instalação limpa e regressão registradas em TEST_REPORT.md e TASKS.md. Segurança e publicação remota mantêm as pendências explícitas.

## 0.8.1 — 08/10/2026
- Auditoria técnica com correções e regressão real, sem funcionalidades novas. Evidências/limitações em TEST_REPORT.md.
- Migrations 23–27: originais imutáveis e escrita Storage por perfil/estado inclusive ADMIN; snapshot liberado imutável, autoria protegida, configuração validada, PDF existente obrigatório na liberação e DELETE de histórico revogado.
- Campos textuais obrigatórios rejeitam whitespace ASCII/Unicode pela API direta; revisões CQ preservam legado. Textareas de NC conservam estado explícito em erro; fixture de totais pagina bases com mais de 1000 OPs.
- Constraint de apontamentos em UPDATE e índices adicionais para notificações/atores/histórico de itens aposentados.
- Uploads de PCP/Operador/CQ compartilham parsing PDF e decodificação real de imagens, extensão/MIME/limites; sharp já transitivo do Next declarado diretamente. Fixture PNG inválida substituída por arquivo decodificável.
- Retomada do relatório compara versão exata e valida páginas/tamanho; cabeçalhos nosniff/DENY/no-referrer, corrigido conflito de política de referrer detectado no download.
- Novos testes de API/RLS/Storage/schema, arquivos falsos/corrompidos/dimensões excessivas, fluxo completo via UI, PDF real e reabertura com versões preservadas; scripts test/test:unit/test:audit sequenciais.
- Alerta sem patch upstream na cadeia dev do ESLint permanece explícito; dependências de produção sem alertas. Nenhum reset/migration remota/deploy.

## 0.8.0 — 08/10/2026
- Dashboards PCP/CQ com gráficos de barras, filtros de período e agregações PostgreSQL reais sob RLS; quantidades separadas por unidade e taxa de conformidade sem itens sem resultado.
- Migration 22 somente leitura; fluxos e permissões de módulos anteriores preservados.
- PCP em cards no tablet/tabela desktop, navegação com seção ativa, breadcrumbs, atalho para conteúdo, tabelas acessíveis e controles maiores em toque.
- Componentes compartilhados de feedback, sem animações ou fechamento automático; diálogos limitados à viewport e documentação da semântica dos indicadores.
- Testes de tablets 768×1024 e 800×1280, desktop, agregações/permissões, períodos inválidos e mensagens de sucesso; resultados em TASKS.md.
- ESLint ignora resultados gerados do Playwright, evitando corrida de diretório durante execução dos testes.
- Sem novas dependências, migration remota ou deploy.

## 0.7.0 — 07/10/2026
- Implementadas finalização PCP/ADMIN, aprovação PCP APPROVED com ator/data reais e critérios no banco; relatório pendente durável para geração e retomada.
- Gerador PDF real com pdf-lib/fontkit/Open Sans licenciada: snapshot integral de OP/checklist/notas/NC/aprovações, empresa, UUID/versão/geração, paginação, acentos e anexo do original quando compatível. Original separado preservado em incompatibilidade.
- Migrations 17–21 aplicadas sem reset: enum PCP, empresa, registry imutável final_reports com RLS, snapshot transacional, path/versões/hash/páginas e vínculo guardado. Storage privado até 40 MB, sem overwrite/delete e somente caminho pendente emitido.
- Adicionados histórico de relatórios no PCP/CQ/operador, rota autenticada de signed URL e auditoria completa paginada por OP. Auditoria preserva todos os eventos e inclui relatórios.
- Implementada reabertura por ADMIN ou profile ativo com flag e acesso real, motivo/versão, preservando respostas/histórico/PDFs; retomada do operador e nova finalização produzem outro relatório. OP/filhos FINALIZED são imutáveis inclusive ADMIN.
- Corrigidos sombra do parâmetro path na policy, subset de fonte incompatível, rodapé omitido ao salvar antes de desenhar e sessões de fixture invalidadas pelo logout Auth.
- Adicionados 13 testes de banco e 10 Chromium de finalização/PDF/reabertura/auditoria, concorrência, falhas/retomada, API/permissões e tablet; script test:finalization. Validação de PDF inclui parse, extração de texto, render e inspeção visual.
- Snapshot registra remetente real do envio operador/CQ a partir da auditoria, distinto do responsável planejado. Todos os 158 cenários passaram (86 banco + 72 browser); TypeScript, lint SQL, ESLint e build passaram. Snapshot/PDF com mais de 1000 apontamentos do PostgreSQL validado integralmente.
- Documentação e exemplo de empresa atualizados. Sem migration remota/deploy.

## 0.6.0 — 07/10/2026
- Implementados dashboard/fila CQ, revisão de checklist, aprovação, reprovação com motivo e retorno controlado de OP bloqueada. Rotas CQ/NC exclusivas de ADMIN/QUALIDADE ativos no proxy, servidor, RPC e RLS.
- Implementados abertura/tratamento/fechamento/cancelamento de NC, campos completos, evidências privadas antes/depois, busca/filtros/paginação e histórico. Código anual sequencial concorrente; códigos anteriores preservados.
- Migrations 12–16 aplicadas sem reset: enums NC em inglês, decisão CQ APPROVED/REJECTED, assinatura/horários reais, máquina de estados centralizada, critérios backend, índices/views/RPCs, notificações atômicas e proibição de delete NC.
- Aprovação só após obrigatórios/revisões/impedimentos; retorno mantém rastreabilidade das medições. NC já não impeditiva pode concluir enquanto OP aguarda PCP sem nova NC/reclassificação.
- Corrigidos aprovação final com NULL, falsificação de assinatura CQ por ADMIN, re-bloqueio ao reiniciar revisão e acessibilidade de textareas na edição. Contagens PCP/Operador respeitam enums e cancelamento.
- Passaram 16 integrações e 16 Chromium CQ/NC, com API direta, transições válidas/inválidas, concorrência, rollback, documentos e tablet; script test:quality. Regressões incluídas: 135 cenários (73 banco + 62 navegador), sem falhas/ignorados. TypeScript, lint SQL, ESLint e build passaram. Documentação e instruções reutilizáveis atualizadas.
- Sem novas dependências, migration remota ou deploy.

## 0.5.0 — 07/10/2026
- Implementada área OPERADOR com Minhas OPs e execução otimizada para tablet: cards, cabeçalho sticky, controles amplos, loading/erros, PDF e evidências assinadas.
- Adicionadas migrations 9–11, RPCs SECURITY INVOKER e guards de API direta para início, medição, apontamento e envio ao CQ, com autorização/concorrência/autoria/horários no banco.
- Calculada conformidade dos cinco tipos no snapshot; não conforme exige observação. Evidência opcional em qualquer item, PHOTO com objeto privado real.
- Bloqueio de medição impeditiva cria NC CHECKLIST/ALTA e notifica QUALIDADE ativo na mesma transação; envio CQ também notifica e audita. Falhas revertem todo o conjunto.
- Adicionados NC.impeditiva default true/índice, proteção de classificação e quatro tipos de apontamento; PRODUCAO histórico preservado, novos registros usam os sete tipos solicitados.
- Envio exige produção, obrigatórios, quantidades informadas inclusive zero e ausência de item/NC impeditivos; regras cobrem PATCH direto.
- Fotos JPEG/PNG/WebP até 10 MB validadas no servidor/Storage/banco, append-only, private/no-store, URL 60s; sem service_role no runtime.
- Adicionada recuperação textual temporária na mesma aba, por usuário/snapshot, TTL 24h, sem substituir banco; preservação de erro e limpeza após sucesso/logout. Corrigida limpeza antes do refresh desmontar formulário e rótulos acessíveis de selects.
- Atualizada consulta PCP para traduzir novos tipos de apontamento e navegação/rota protegida para operador. Sem alterar catálogo/planejamento/CQ pelo operador.
- Passaram 13 integrações e 12 Chromium novos; 103 cenários totais com regressões, incluindo conexão interrompida, tablet, forja de POST/API e rollback de NC. TypeScript, lint SQL, ESLint e build passaram.
- Atualizados requisitos/arquitetura/execução/fases. Operador concluído localmente; CQ, tratamento manual de NC, relatório/finalização, dashboard geral e etapas gerais permanecem pendentes. Sem deploy/migration remota.

## 0.4.0 — 07/10/2026
- Implementado PCP nas rotas dashboard/listagem/nova/detalhes, exclusivo de ADMIN/PCP ativos e integrado à navegação desktop/tablet.
- Adicionados oito indicadores reais, tabela paginada, filtros e pesquisa por OP/produto/lote, com escaping de caracteres especiais.
- Adicionadas criação real de DRAFT, número único, data/hora São Paulo, PDF privado até 20 MB e recuperação de rascunho em falhas de upload/vínculo.
- Adicionadas migrations 7/8 e RPCs SECURITY INVOKER para criação, vínculo PDF, dashboard e preparação atômica, com lock de OP/versão, snapshots completos e auditoria existente.
- Corrigido SELECT FOR SHARE sob RLS de catálogo: helpers privados autorizados bloqueiam somente o catálogo pertinente, sem conceder edição ao PCP.
- Adicionados metadados independentes do modelo, horário timestamptz/sincronização da data, view SECURITY INVOKER e índices de consultas.
- Adicionados badge traduzido de status e detalhes de checklist/notas/NCs/aprovações/histórico; PDF aberto por rota autenticada e signed URL de 60s no clique.
- Preservados campos/arquivo da nova OP após validação negativa; bloqueada nova criação quando o rascunho já foi salvo e requer retomada de upload.
- Validados 12 testes PCP no banco e 12 no Chromium, incluindo falha real no segundo item e no Storage, concorrência e permissões. Regressões completam 78 cenários validados. TypeScript, ESLint, lint SQL e build passaram.
- Atualizados documentos e marcada PCP concluída no escopo de criação/consulta/preparação/liberação; finalização, operação, CQ/NC e relatório permanecem nas etapas seguintes. Sem deploy/migration remota.

## 0.3.0 — 07/10/2026
- Implementada Administração: usuários/profiles, linhas, produtos e modelos de checklist com dados reais e CRUD por desativação/reativação.
- Adicionados layout autenticado compartilhado, sidebar desktop, menu tablet, identidade e logout; pesquisa/paginação e componentes de tabela/campos/badges/loading/vazio/erro/confirmação.
- Adicionados editor de itens, opções SELECT, resposta conforme BOOLEAN, limites NUMBER, duplicação e nova revisão independente de modelo.
- Adicionada sexta migration: RLS de manutenção exclusiva ADMIN, revogação de delete físico, proteção do próprio ADMIN/identidade Auth, constraints e validação de itens.
- Adicionada RPC SECURITY INVOKER transacional para modelo e itens, com controle de concorrência; itens aposentados e snapshots/FKs de OPs antigas preservados.
- Adicionada validação Zod em pt-BR nas ações do servidor, sempre com sessão real e autorização interna, inclusive em POST por outra rota.
- Corrigidos redirects de Server Actions após revogação de perfil e ON CONFLICT do seed para índice parcial de itens ativos.
- Passaram TypeScript, ESLint, lint SQL, build, 13 integrações administrativas, 12 testes Chromium administrativos e regressões de 19 RLS/Storage + 10 Auth (54 testes).
- Atualizada documentação e marcada apenas a nova fase Administração como concluída, mantendo fases posteriores pendentes. Validação local; sem deploy/migration remota.

## 0.2.0 — 07/10/2026
- Adicionadas migrations reais: onze entidades, enums, foreign keys, constraints, índices e updated_at automático.
- Adicionadas RLS por perfil/OP, proteção de campos, autoria no banco, auditoria append-only e regras mínimas de transição/reabertura.
- Adicionados buckets industriais privados, políticas por OP e serviço de URL assinada de curta duração.
- Adicionados login/logout Supabase Auth real, cookies SSR HttpOnly e proteção de rota/perfil ativo no proxy e servidor.
- Adicionados tipos gerados do PostgreSQL real e seed local de catálogo (2 linhas, 3 produtos, 3 modelos, 13 itens) e cinco perfis Auth.
- Adicionados testes de integração RLS/Storage e testes de autenticação no Chromium, sem mocks.
- Corrigidas visibilidade de INSERT RETURNING na RLS de OP e permissões de helpers para manutenção confiável.
- Validados lint SQL, 19 testes RLS/Storage, 10 testes Chromium, TypeScript, lint e build; fase Banco e autenticação concluída localmente.
- Documentadas matriz de acesso, configuração, bootstrap ADMIN e limite de validação local.
- Contornadas limitações de proxy e Docker VFS usando ferramentas oficiais, checksums e exportação por digest, sem desabilitar verificação.

## 0.1.0 — 07/10/2026
- Criada a base do OP Digital com Next.js, TypeScript, App Router e Tailwind CSS.
- Criada tela inicial responsiva em português do Brasil.
- Instalados supabase-js e Zod para integração nas próximas fases.
- Documentados requisitos, arquitetura, fases e execução.
- Incluído exemplo de variáveis sem credenciais reais.
- Reservada estrutura para módulos e migrações, sem implementação funcional dessas fases.
