begin;
-- Review reset is not a new measurement: do not re-block while resuming correction.
create or replace function private.block_nonconforming_order() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.conforme is false and new.bloqueia_op_se_nao_conforme and (tg_op='INSERT' or new.data_medicao is distinct from old.data_medicao or new.conforme is distinct from old.conforme or new.valor_numero is distinct from old.valor_numero or new.resposta_boolean is distinct from old.resposta_boolean or new.resposta_select is distinct from old.resposta_select or new.resposta_texto is distinct from old.resposta_texto or new.foto_path is distinct from old.foto_path) then
  update public.production_orders set status='BLOCKED_QUALITY',version=version+1,aprovacao_cq='REJECTED',responsavel_cq_id=null,data_aprovacao_cq=null,motivo_bloqueio='Medição impeditiva não conforme: '||new.item where id=new.production_order_id and status='IN_PRODUCTION';
  if found and auth.uid() is not null then
   insert into public.non_conformities(codigo_nc,production_order_id,checklist_item_id,tipo,descricao,severidade,acao_imediata,impeditiva,created_by,evidencia_antes_path)
   values('',new.production_order_id,new.id,'CHECKLIST','Item: '||new.item||'. '||coalesce(new.observacao,''),'HIGH','OP bloqueada automaticamente; aguardar CQ.',true,auth.uid(),new.foto_path);
  end if;
 end if;
 return new;
end $$;
commit;
