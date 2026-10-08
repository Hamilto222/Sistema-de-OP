begin;
-- Reopened production resumes through the same guarded operator action.
do $$ declare definition text;begin
 definition=pg_get_functiondef('public.operator_start_order(uuid,integer)'::regprocedure);
 definition=replace(definition,'o.status<>''RELEASED''','o.status not in (''RELEASED'',''REOPENED'')');execute definition;
 definition=pg_get_functiondef('private.guard_order()'::regprocedure);
 definition=replace(definition,'old.status=''RELEASED'' and new.status=''IN_PRODUCTION'' and old.operador_responsavel_id is null','old.status in (''RELEASED'',''REOPENED'') and new.status=''IN_PRODUCTION'' and old.operador_responsavel_id is null');execute definition;
 definition=pg_get_functiondef('private.freeze_finalized_children()'::regprocedure);
 definition=replace(definition,'if exists(select 1 from public.production_orders where id=target and status=''FINALIZED'')', 'if (tg_op=''UPDATE'' and exists(select 1 from public.production_orders where id=old.production_order_id and status=''FINALIZED'')) or exists(select 1 from public.production_orders where id=target and status=''FINALIZED'')');execute definition;
end $$;
commit;
