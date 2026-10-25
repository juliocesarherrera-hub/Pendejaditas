-- READ ONLY. After installation with Cron enabled. No user or bid records.
select jsonb_pretty(jsonb_build_object(
  'tables',(select jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
    and c.relname in('auctions','auction_photos','auction_bids','auction_bid_history','auction_results','auction_bid_attempts','auction_notifications','auction_audit_events','auction_risk_flags')),
  'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where
    (p.schemaname='public' and p.tablename in('auctions','auction_photos','auction_bids','auction_bid_history','auction_results','auction_bid_attempts','auction_notifications','auction_audit_events','auction_risk_flags'))
    or (p.schemaname='storage' and p.policyname='auction_photos_preserve')),
  'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'definer',p.prosecdef,'settings',p.proconfig,'acl',p.proacl,'definition',pg_get_functiondef(p.oid)))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in('protect_auction_product','guard_auction_product_insert','create_auction','settle_auction_locked','place_auction_bid','auction_snapshot','cancel_auction','guard_auction_exchange','coordinate_auction','read_auction_notification','advance_auction_clock','auctions_health')),
  'grants',(select jsonb_agg(to_jsonb(g)) from information_schema.role_table_grants g where g.table_schema='public'
    and g.table_name in('auctions','auction_photos','auction_bids','auction_bid_history','auction_results','auction_bid_attempts','auction_notifications','auction_audit_events','auction_risk_flags')
    and g.grantee in('anon','authenticated','PUBLIC')),
  'product_sale_type_check',(select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.products'::regclass and conname='products_sale_type_check'),
  'cron_job',(select jsonb_agg(jsonb_build_object('jobname',jobname,'schedule',schedule,'active',active,'command',command)) from cron.job where jobname='pendejaditas-auction-clock'),
  'realtime',(select jsonb_agg(tablename) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'
    and tablename in('auctions','auction_bid_history','auction_notifications','auction_bids','auction_bid_attempts','auction_audit_events','auction_risk_flags','auction_results','user_blocks'))
)) as auctions_audit;
