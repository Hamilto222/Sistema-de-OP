begin;
-- Read-only analytics keep session RLS; no privileged client or row-limit truncation.
create or replace function public.dashboard_analytics(period_start date default null, period_end date default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','PCP','QUALIDADE') then
  raise exception 'Acesso exclusivo de PCP, CQ ou ADMIN ativo' using errcode='42501';
 end if;
 if period_start > period_end then raise exception 'Período inicial deve anteceder o final'; end if;
 with orders as materialized (
  select o.*,p.codigo || ' · ' || p.descricao as product,l.nome as line
  from public.production_orders o join public.products p on p.id=o.produto_id
  join public.production_lines l on l.id=o.linha_id
  where (period_start is null or o.data_programada>=period_start)
    and (period_end is null or o.data_programada<=period_end)
 ), ncs as materialized (
  select n.*,o.product from public.non_conformities n join orders o on o.id=n.production_order_id
 ), measures as materialized (
  select c.* from public.production_order_checklist c join orders o on o.id=c.production_order_id
 )
 select jsonb_build_object(
  'cards',jsonb_build_object(
   'OPs hoje',count(*) filter(where data_programada=(now() at time zone 'America/Sao_Paulo')::date and status<>'CANCELLED'),
   'Liberadas',count(*) filter(where status='RELEASED'),
   'Em produção',count(*) filter(where status='IN_PRODUCTION'),
   'Aguardando CQ',count(*) filter(where status='AWAITING_QUALITY'),
   'Bloqueadas',count(*) filter(where status='BLOCKED_QUALITY'),
   'Aguardando PCP',count(*) filter(where status='AWAITING_PCP'),
   'Finalizadas',count(*) filter(where status='FINALIZED'),
   'NCs abertas',(select count(*) from ncs where status not in ('CLOSED','CANCELLED')),
   'Itens aguardando revisão',(select count(*) from measures m join orders o on o.id=m.production_order_id where m.requer_revisao_cq and not m.revisado_cq and o.status in ('AWAITING_QUALITY','BLOCKED_QUALITY'))),
  'status',coalesce((select jsonb_agg(jsonb_build_object('label',status,'value',amount) order by status) from (select status,count(*) amount from orders group by status) s),'[]'::jsonb),
  'lines',coalesce((select jsonb_agg(jsonb_build_object('label',line,'value',amount) order by line) from (select line,linha_id,count(*) amount from orders group by line,linha_id) s),'[]'::jsonb),
  'quantities',coalesce((select jsonb_agg(jsonb_build_object('unit',unidade,'planned',planned,'produced',produced,'lost',lost,'recorded',recorded,'total',total) order by unidade) from (select unidade,sum(quantidade_planejada) planned,sum(coalesce(quantidade_produzida,0)) produced,sum(coalesce(quantidade_perdida,0)) lost,count(quantidade_produzida) recorded,count(*) total from orders where status<>'CANCELLED' group by unidade) s),'[]'::jsonb),
  'ncProducts',coalesce((select jsonb_agg(jsonb_build_object('label',product,'value',amount) order by amount desc,product) from (select product,count(*) amount from ncs group by product, (select produto_id from orders where id=ncs.production_order_id)) s),'[]'::jsonb),
  'severity',coalesce((select jsonb_agg(jsonb_build_object('label',severidade,'value',amount) order by severidade) from (select severidade,count(*) amount from ncs group by severidade) s),'[]'::jsonb),
  'parameters',coalesce((select jsonb_agg(jsonb_build_object('label',item,'value',amount) order by amount desc,item) from (select item,count(*) amount from measures where conforme is false group by item) s),'[]'::jsonb),
  'compliance',jsonb_build_object('conforming',(select count(*) from measures where conforme is true),'nonconforming',(select count(*) from measures where conforme is false),'unmeasured',(select count(*) from measures where conforme is null))
 ) into result from orders;
 return result;
end $$;
revoke all on function public.dashboard_analytics(date,date) from public,anon;
grant execute on function public.dashboard_analytics(date,date) to authenticated;
commit;
