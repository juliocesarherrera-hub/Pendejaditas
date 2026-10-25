-- READ ONLY. Execute only AFTER authorized installation of migration 006.
-- Reads definitions and grants, never tokens/hashes, incidents or user records.
select jsonb_pretty(jsonb_build_object(
 'tables',(select jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity)) from pg_class c
  join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in
  ('delivery_operations','delivery_qr_tokens','delivery_receipts','delivery_events','delivery_attempts','delivery_incidents','delivery_incident_reviews')),
 'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where p.schemaname='public' and p.tablename like 'delivery\_%' escape '\'),
 'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'definer',p.prosecdef,'settings',p.proconfig,'acl',p.proacl,'definition',pg_get_functiondef(p.oid)))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and
   (p.proname like 'delivery\_%' escape '\' or p.proname in('create_delivery','issue_delivery_qr','redeem_delivery_qr','confirm_delivery','cancel_delivery','report_delivery_incident','review_delivery_incident'))),
 'grants',(select jsonb_agg(to_jsonb(g)) from information_schema.role_table_grants g where g.table_schema='public'
  and g.table_name like 'delivery\_%' escape '\' and g.grantee in('anon','authenticated','PUBLIC')),
 'triggers',(select jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)))
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and n.nspname='public' and t.tgname like 'delivery\_%' escape '\'),
 'realtime',(select jsonb_agg(tablename) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename like 'delivery\_%' escape '\')
)) as delivery_audit;
