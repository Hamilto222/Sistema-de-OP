begin;
-- The active-only unique index does not support FK/history checks for retired items.
create index checklist_items_template_history_idx
 on public.checklist_template_items(template_id,id);
commit;
