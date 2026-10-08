begin;
-- Qualify the function argument: the registry also has a column named path.
do $$ declare definition text;begin
 definition=pg_get_functiondef('private.can_write_object(text,text)'::regprocedure);
 definition=replace(definition,'where r.path=path and r.status', 'where r.path=$2 and r.status');execute definition;
end $$;
commit;
