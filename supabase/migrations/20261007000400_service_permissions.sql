begin;
-- Trusted maintenance/seed operations use service_role. This schema remains outside
-- the API's exposed schemas; anonymous users receive no access.
-- Triggers invoke private helpers even when the privileged write bypasses RLS.
grant usage on schema private to service_role;
grant execute on all functions in schema private to service_role;
commit;
