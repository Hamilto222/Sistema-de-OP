begin;
-- During a new finalization, the current path is pending; previous versions stay in the registry.
do $$ declare definition text;begin
 definition=pg_get_functiondef('private.guard_order()'::regprocedure);
 definition=replace(definition,'new.responsavel_pcp_id=auth.uid();new.data_finalizacao=now();','new.responsavel_pcp_id=auth.uid();new.data_finalizacao=now();new.relatorio_final_path=null;');execute definition;
end $$;
commit;
