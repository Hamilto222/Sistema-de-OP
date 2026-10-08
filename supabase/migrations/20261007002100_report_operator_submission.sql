begin;
-- The operator who submitted production may differ from the planned responsible operator.
-- Derive the real submission from immutable audit, excluding controlled CQ returns.
do $$ declare definition text;begin
 definition=pg_get_functiondef('private.capture_final_report()'::regprocedure);
 definition=replace(definition,'''order'',to_jsonb(new),','''order'',to_jsonb(new),''operator_submission'',(select jsonb_build_object(''user_id'',a.user_id,''created_at'',a.created_at) from public.audit_logs a where a.production_order_id=new.id and a.entity=''production_orders'' and a.field=''status'' and a.old_value=''"IN_PRODUCTION"''::jsonb and a.new_value=''"AWAITING_QUALITY"''::jsonb order by a.created_at desc,a.id desc limit 1),');
 definition=replace(definition,'union select encerrado_por from public.non_conformities where production_order_id=new.id','union select encerrado_por from public.non_conformities where production_order_id=new.id union select user_id from public.audit_logs where production_order_id=new.id and entity=''production_orders'' and field=''status'' and old_value=''"IN_PRODUCTION"''::jsonb and new_value=''"AWAITING_QUALITY"''::jsonb');execute definition;
end $$;
commit;
