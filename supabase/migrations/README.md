# Migrações

1. `20261007000100_schema.sql`: enums, onze entidades, FKs, constraints, índices, updated_at e perfil Auth automático inativo.
2. `20261007000200_permissions.sql`: RLS, validação de campos/transições por perfil, autoria, auditoria automática e bloqueio de medição não conforme.
3. `20261007000300_storage.sql`: buckets privados e políticas por OP/perfil.
4. `20261007000400_service_permissions.sql`: acesso dos helpers privados para operações confiáveis de seed/manutenção via service_role, sem exposição pública.
5. `20261007000500_order_row_visibility.sql`: autorização direta dos campos da OP para permitir INSERT RETURNING, sem depender de consulta à própria linha ainda invisível no snapshot.

6. `20261007000600_administration.sql`: manutenção exclusiva ADMIN, delete físico revogado, proteção de profile/Auth, validação de catálogo/itens, índice parcial de itens ativos, RPC transacional com concorrência e BOOLEAN conforme configurável.

7. `20261007000700_pcp.sql`: data/hora e snapshots de modelo, view invoker, criação/vínculo/preparação transacionais e dashboard PCP.
8. `20261007000800_pcp_catalog_locks.sql`: locks privados de catálogo, autorizados para ADMIN/PCP, corrigindo SELECT FOR SHARE sob a RLS somente leitura do PCP; RPCs públicas permanecem invoker.

9. `20261007000900_operator_note_types.sql`: novos tipos de apontamento, com commit separado antes de utilizar os enums.
10. `20261007001000_operator.sql`: NC impeditiva, conformidade/observação/evidência, início e envio guardados, RPCs invoker, NC e notificações transacionais.
11. `20261007001100_operator_note_validation.sql`: preserva PRODUCAO histórico e restringe novos apontamentos de operador aos sete tipos; unidade validada também no PATCH/INSERT direto.

12. `20261007001200_quality_types.sql`: novo enum de decisão CQ e CANCELLED para NC, com commit antes do uso.
13. `20261007001300_quality.sql`: converte enums/decisão preservando registros, máquina de estados, revisão/decisão/NC, códigos sequenciais com legado, auditoria/notificações e índices/views/RPCs.
14. `20261007001400_quality_integrity.sql`: evita aprovação final NULL, protege assinaturas ADMIN/CQ, documento privado NC e contagem PCP sem canceladas.
15. `20261007001500_quality_resume_measurements.sql`: limpeza de revisão durante retorno não dispara bloqueio da medição antiga.
16. `20261007001600_quality_nonblocking_followup.sql`: permite tratar NC já não impeditiva em AWAITING_PCP, sem nova NC ou reclassificação impeditiva.

17. `20261007001700_finalization_reports.sql`: aprovação PCP enum, critérios/assinatura/imutabilidade, snapshot/registro durável de relatório, finalização/reabertura/vínculo, RLS/Storage/auditoria.
18. `20261007001800_reopened_execution.sql`: retomada pelo operador em REOPENED e proteção dos filhos finalizados.
19. `20261007001900_final_report_path_policy.sql`: qualifica argumento path no helper Storage para exigir exatamente o caminho emitido.
20. `20261007002000_final_report_current_path.sql`: nova finalização limpa ponteiro enquanto pendente, mantendo versões antigas no registry.

21. `20261007002100_report_operator_submission.sql`: captura remetente real do operador a partir da auditoria, distinto do responsável planejado e do retorno controlado CQ.

Atualização incremental local: `npm run supabase -- migration up --local` e `npm run db:types`, sem apagar dados. O seed usa `ON CONFLICT (template_id,ordem) WHERE ativo` para corresponder ao índice parcial.

Aplicação local: `npm run db:start` e `npm run db:reset`. Reset é destrutivo para os dados da instância **local**; não usar em banco compartilhado. Migrations não incluem senhas ou usuários. Seed está separado.

Antes de aplicar em um projeto existente, revise as tabelas e quaisquer políticas anteriores: políticas permissivas do PostgreSQL são combinadas por OR. O schema foi desenhado para um projeto Supabase novo. Não manter políticas antigas abertas em tabelas/storage.

Projeto hospedado: use Supabase CLI autenticada, link ao projeto correto e `supabase db push` após revisão. Não há aplicação automática ou acesso remoto configurado nesta etapa. Faça backup e valide em homologação antes de produção.

Migration 22: `dashboard_analytics(date,date)` agrega cards/gráficos sob SECURITY INVOKER/RLS; valida perfil ativo e período; preserva os módulos e RPCs anteriores. Não exige reset ou seed novo.


23. `20261008002300_technical_audit_integrity.sql`: Storage imutável/estados inclusive ADMIN, guards de integridade de snapshot/liberação, validação de definições copiada, DELETE de histórico revogado, constraint de apontamentos e índices de notificações/atores.
24. `20261008002400_historical_checklist_index.sql`: índice integral template/id para FK/histórico de itens aposentados; índice parcial ativo continua atendendo o editor.

Migrations da auditoria aplicadas incrementalmente, sem reset. Se houver dados legados fora dos limites de descrição/unidade, revisar previamente; a migration não apaga ou corrige silenciosamente registros históricos. Testes da auditoria e limitações documentados em TEST_REPORT.md.

25. `20261008002500_meaningful_required_text.sql`: guard de campos obrigatórios do fluxo contra tabulações/quebras de linha pela API direta, depois do cálculo/assinaturas.
26. `20261008002600_unicode_required_text.sql`: inclui whitespace ECMAScript/Zod como NBSP/BOM, que POSIX não classifica integralmente como espaço.
27. `20261008002700_preserve_legacy_measurement_review.sql`: valida resposta/observação quando medição muda; revisão/reset CQ preserva legado sem exigir reescrita retrospectiva.
