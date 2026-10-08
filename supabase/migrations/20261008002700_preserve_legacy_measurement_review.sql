begin;
-- Review/reset must preserve legacy measurements, not demand their retrospective rewrite.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('private.enforce_meaningful_text()'::regprocedure);
 definition:=replace(definition,
  'if new.data_medicao is not null and new.tipo_resposta=''TEXT'' then',
  'if new.data_medicao is not null and new.tipo_resposta=''TEXT'' and (tg_op=''INSERT'' or new.resposta_texto is distinct from old.resposta_texto or new.data_medicao is distinct from old.data_medicao) then');
 definition:=replace(definition,
  'if new.conforme is false then',
  'if new.conforme is false and (tg_op=''INSERT'' or new.observacao is distinct from old.observacao or new.data_medicao is distinct from old.data_medicao or new.conforme is distinct from old.conforme) then');
 execute definition;
end $$;
commit;
