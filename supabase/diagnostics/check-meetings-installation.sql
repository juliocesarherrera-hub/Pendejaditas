-- READ ONLY. Check whether the failed execution left any stage-3 objects.
-- If all installed=false, the new migration can be executed from BEGIN to COMMIT.
-- If any installed=true, do not delete or repeat: review the installed definitions.
select 'table' as object_type, name, to_regclass('public.' || name) is not null as installed
from unnest(array['meeting_places','exchange_requests','exchange_appointments','appointment_events']) as expected(name)
union all
select 'function', name, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=name)
from unnest(array['request_exchange','respond_exchange','change_appointment','meetings_health']) as expected(name);
