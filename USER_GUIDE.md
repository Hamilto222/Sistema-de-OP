# Guia de uso — OP Digital

Entre em `/login` com a conta provisionada pelo administrador. Seu perfil precisa estar ativo. Use “Sair” ao terminar, especialmente em tablet compartilhado. Datas e horários seguem São Paulo. Os status sempre têm texto.

## PCP

1. Abra PCP para consultar indicadores, gráficos e ordens; filtre período/linha/produto/status/operador.
2. Em “Nova OP”, informe número único, produto, lote, linha, quantidade/unidade, prioridade, programação e PDF. Salve; a OP fica Rascunho. Se o upload falhar, retome na mesma OP.
3. Confira os dados e use “Preparar OP”. O sistema copia o modelo vigente do produto e libera a ordem. Alterações posteriores do modelo não modificam essa cópia.
4. Acompanhe produção, CQ, NCs e histórico na OP. Após aprovação CQ, use “FINALIZAR OP”, informe a empresa e aguarde o relatório.
5. Abra o PDF em “Relatórios finais e versões”. Se aparecer geração pendente, use “Gerar relatório pendente”; não recrie a OP. A auditoria completa mostra alterações e responsáveis.

## Operador

1. Em “Minhas OPs”, escolha o card da ordem permitida a você ou sua linha. Confira produto/lote e abra “Visualizar OP”.
2. Na OP Liberada, use “INICIAR PRODUÇÃO”. Preencha Preparação, Processo e Finalização seguindo instruções e limites.
3. Salve cada medição. O servidor calcula o resultado. Em NÃO CONFORME, informe observação; item impeditivo bloqueia a OP e abre NC. Aguarde a ação LIBERAR PARA CORREÇÃO da Qualidade. Mudar a NC para Em tratamento não libera a OP. Após o aviso de liberação, consulte as instruções e use Registrar nova medição; a tentativa anterior permanece no histórico.
4. Use “+ Apontamento” para observação, parada, perda, ajuste, retrabalho, manutenção ou segurança. Informe dados e foto quando necessário.
5. Informe quantidade produzida, perdas (inclusive zero) e observação final. Use “ENVIAR AO CONTROLE DE QUALIDADE”. Obrigatórios ou impedimentos pendentes impedem o envio.

Botões e campos são amplos para tablet. Após erro, confira a mensagem antes de repetir. Rascunho textual pode ser recuperado na mesma aba após atualização; não substitui salvar no banco, não contém fotos e não permite trabalhar offline. Se houver conflito, recarregue e confira o registro oficial.

## Qualidade

1. Abra a fila de OPs aguardando CQ/bloqueadas. Confira PDF, esperado/medido, resultado, autor, horário e evidências.
2. Use “REVISAR ITEM” nos itens destacados. A revisão registra você e o horário sem reescrever a medição.
3. Em Não conformidades, registre descrição, severidade, ação imediata, responsável e evidências. O fluxo é Aberta → Em tratamento/Aguardando CQ → Fechada; fechamento exige ação, responsável ativo e observação CQ. Cancelamento exige justificativa. O histórico é preservado.
4. “APROVAR OP” exige itens completos/revisados e impedimentos resolvidos; envia ao PCP. “BLOQUEAR / REPROVAR” exige motivo.
5. Para liberar uma OP bloqueada para correção, abra a NC impeditiva, selecione Em tratamento e preencha responsável ativo, ação imediata e observação CQ. Salve e confirme LIBERAR PARA CORREÇÃO. A NC permanece aberta. Após a nova medição conforme, revise o item e confirme APROVAR CORREÇÃO / FECHAR NC. O operador ainda precisa concluir e enviar a OP para sua aprovação final. Fechar a NC não aprova a OP.

## Administrador

- Provisiona identidades no Supabase Auth; na aplicação edita nome/perfil/linha/status e autorização de reabertura em Usuários. Senhas não são manipuladas no banco.
- Mantém linhas, produtos e modelos. Prefira desativar cadastros; registros históricos não são apagados.
- No checklist, configure tipos, limites, obrigatoriedade, momento, revisão CQ e bloqueio. BOOLEAN permite escolher resposta conforme; SELECT permite opções e opções conformes.
- Duplicar/criar revisão conserva o modelo anterior. Para usar nova revisão, altere explicitamente o modelo no produto; OPs existentes mantêm seus itens.
- Não pode demover/desativar o próprio ADMIN. Mantenha uma conta administrativa de recuperação sob controle da empresa.

## Reabertura e documentos

ADMIN ou usuário com autorização de reabertura e acesso à OP pode reabrir uma ordem finalizada com relatório pronto, informando motivo. Produção retoma, CQ revisa e PCP finaliza nova versão. PDFs e auditoria anteriores permanecem disponíveis; edição comum de ordem finalizada é bloqueada.

Documentos são privados. Abra pelo botão do sistema; links expiram e devem ser reabertos pela interface. Não compartilhe links nem contas. Se upload ou PDF continuar falhando, informe número da OP e mensagem ao responsável técnico; não envie senha ou URL assinada. Limites da hospedagem estão em DEPLOYMENT.md.
