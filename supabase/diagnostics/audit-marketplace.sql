-- READ ONLY: one SELECT. Does not create objects or read user/product records.
-- Run in Supabase SQL Editor and share the resulting JSON, not credentials.
select jsonb_pretty(jsonb_build_object(
  'tables', (select jsonb_agg(jsonb_build_object('schema', n.nspname, 'table', c.relname,
    'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where (n.nspname = 'public' and c.relname in ('profiles','products'))
       or (n.nspname = 'storage' and c.relname = 'objects')),
  'policies', (select jsonb_agg(to_jsonb(p)) from pg_policies p
    where (p.schemaname = 'public' and p.tablename in ('profiles','products'))
       or (p.schemaname = 'storage' and p.tablename = 'objects')),
  'columns', (select jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name,
    'type', data_type, 'nullable', is_nullable, 'default', column_default))
    from information_schema.columns where table_schema = 'public' and table_name in ('profiles','products')),
  'constraints', (select jsonb_agg(jsonb_build_object('table', c.relname, 'name', con.conname,
    'definition', pg_get_constraintdef(con.oid))) from pg_constraint con
    join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('profiles','products')),
  'triggers', (select jsonb_agg(jsonb_build_object('schema', n.nspname, 'table', c.relname,
    'name', t.tgname, 'enabled', t.tgenabled, 'definition', pg_get_triggerdef(t.oid)))
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and ((n.nspname = 'public' and c.relname in ('profiles','products'))
      or (n.nspname = 'auth' and c.relname = 'users'))),
  'functions', (select jsonb_agg(jsonb_build_object('name', p.proname, 'security_definer', p.prosecdef,
    'settings', p.proconfig, 'acl', p.proacl, 'definition', pg_get_functiondef(p.oid)))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
    and p.proname in ('handle_new_user','validate_product_image','set_updated_at','marketplace_health')),
  'table_grants', (select jsonb_agg(to_jsonb(g)) from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name in ('profiles','products')
      and g.grantee in ('anon','authenticated','PUBLIC')),
  'column_grants', (select jsonb_agg(to_jsonb(g)) from information_schema.role_column_grants g
    where g.table_schema = 'public' and g.table_name in ('profiles','products')
      and g.grantee in ('anon','authenticated','PUBLIC')),
  'bucket', (select jsonb_build_object('id', id, 'public', public, 'file_size_limit', file_size_limit,
    'allowed_mime_types', allowed_mime_types) from storage.buckets where id = 'product-images')
)) as marketplace_audit;
