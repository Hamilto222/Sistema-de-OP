-- Commit new enum values before functions/indexes use them.
alter type public.nc_status add value if not exists 'CANCELLED';
create type public.quality_decision as enum ('APPROVED','REJECTED');
