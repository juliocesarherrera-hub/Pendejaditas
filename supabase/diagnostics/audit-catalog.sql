-- Read-only metadata only. Does not call the RPC, inspect user rows, or install.
-- A missing draft returns present=false; it is NOT a reason to repeat 001-008.
with signatures(signature) as (values
 ('public.catalog_page_v1(jsonb)'),('catalog_private.search_key_v1(text)'),
 ('catalog_private.trim_v1(text)'),('catalog_private.pattern_v1(text)'),
 ('catalog_private.cursor_time_v1(text)'),
 ('catalog_private.fingerprint_v1(text,text,text,integer,integer,text,integer)')
), expected as (
 select s.signature,p.oid,p.prosecdef,p.provolatile,p.proconfig,p.proacl,p.proowner,p.prosrc,p.pronamespace,true expected_signature
 from signatures s left join pg_proc p on p.oid=to_regprocedure(s.signature)
), functions as (
 select * from expected
 union all
 select format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),
  p.oid,p.prosecdef,p.provolatile,p.proconfig,p.proacl,p.proowner,p.prosrc,p.pronamespace,false
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='catalog_private' or (n.nspname='public' and p.proname='catalog_page_v1'))
  and not exists(select 1 from expected e where e.oid=p.oid)
), roles as (
 -- ALL database roles: no passwords, auth.users or application identities.
 select oid,rolname,rolsuper,rolbypassrls,rolinherit,rolcanlogin,rolcreaterole,rolcreatedb,rolreplication from pg_roles
), function_acl as (
 select f.oid,a.* from functions f cross join lateral aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a where f.oid is not null
), namespaces as (
 select oid,nspname,nspowner,nspacl from pg_namespace where nspname in('public','catalog_private')
), sources as (
 select n.nspname,c.relname,c.oid,c.relrowsecurity,c.relforcerowsecurity
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in('products','profiles','auctions') and c.relkind in('r','p')
)
select jsonb_build_object(
 'server',jsonb_build_object('version',current_setting('server_version'),'encoding',current_setting('server_encoding'),
  'database',(select jsonb_build_object('provider',to_jsonb(d)->>'datlocprovider','collation',to_jsonb(d)->>'datcollate','ctype',to_jsonb(d)->>'datctype') from pg_database d where datname=current_database())),
 'catalog_schema_present',to_regnamespace('catalog_private') is not null,
 'functions',(select jsonb_agg(jsonb_build_object('signature',f.signature,'present',f.oid is not null,
  'expected_signature',f.expected_signature,'owner',pg_get_userbyid(f.proowner),
  'schema',case when f.oid is null then null else f.pronamespace::regnamespace::text end,
  'definer',f.prosecdef,'volatility',f.provolatile,'settings',f.proconfig,
  'definition',case when f.oid is null then null else jsonb_build_object(
    'arguments',pg_get_function_arguments(f.oid),'result',pg_get_function_result(f.oid)) end,
  'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),
    'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
    'privilege',a.privilege_type,'grant_option',a.is_grantable) order by a.grantee,a.grantor),'[]'::jsonb) from function_acl a where a.oid=f.oid),
  'body_sha256',case when f.oid is null then null else encode(sha256(convert_to(f.prosrc,'UTF8')),'hex') end,
  'public_execute',exists(select 1 from function_acl a where a.oid=f.oid and a.grantee=0 and a.privilege_type='EXECUTE'),
  'roles',(select coalesce(jsonb_agg(jsonb_build_object('role',r.rolname,
    'execute',case when f.oid is null then false else has_function_privilege(r.oid,f.oid,'EXECUTE') end,
    'direct_execute',exists(select 1 from function_acl a where a.oid=f.oid and a.grantee=r.oid and a.privilege_type='EXECUTE'),
    'grant_option',case when f.oid is null then false else has_function_privilege(r.oid,f.oid,'EXECUTE WITH GRANT OPTION') end,
    'schema_usage',case when f.oid is null then false else has_schema_privilege(r.oid,f.pronamespace,'USAGE') end,
    'owner_or_inherits_owner',case when f.oid is null then false else pg_has_role(r.oid,f.proowner,'USAGE') end,
    'can_set_owner',case when f.oid is null then false else pg_has_role(r.oid,f.proowner,'SET') end,
    'unexpected_effective_execute',case when f.oid is null then false else
      r.rolname not in('anon','authenticated') and not r.rolsuper and not pg_has_role(r.oid,f.proowner,'USAGE')
      and has_function_privilege(r.oid,f.oid,'EXECUTE') end) order by r.rolname),'[]'::jsonb) from roles r)) order by f.signature) from functions f),
 'database_roles',(select jsonb_agg(jsonb_build_object('role',r.rolname,'superuser',r.rolsuper,'bypass_rls',r.rolbypassrls,
   'inherit',r.rolinherit,'login',r.rolcanlogin,'create_role',r.rolcreaterole,'create_db',r.rolcreatedb,'replication',r.rolreplication,
   'inherits_anon',coalesce(pg_has_role(r.oid,to_regrole('anon')::oid,'USAGE'),false),
   'inherits_authenticated',coalesce(pg_has_role(r.oid,to_regrole('authenticated')::oid,'USAGE'),false),
   'can_set_anon',coalesce(pg_has_role(r.oid,to_regrole('anon')::oid,'SET'),false),
   'can_set_authenticated',coalesce(pg_has_role(r.oid,to_regrole('authenticated')::oid,'SET'),false)) order by r.rolname) from roles r),
 'memberships',(select coalesce(jsonb_agg(jsonb_build_object('member',pg_get_userbyid(m.member),
   'role',pg_get_userbyid(m.roleid),'grantor',pg_get_userbyid(m.grantor),'admin',m.admin_option,
   'inherit',m.inherit_option,'set',m.set_option) order by m.member,m.roleid,m.grantor),'[]'::jsonb) from pg_auth_members m),
 'schemas',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'owner',pg_get_userbyid(n.nspowner),
   'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),
    'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
    'privilege',a.privilege_type,'grant_option',a.is_grantable) order by a.grantee,a.privilege_type),'[]'::jsonb)
    from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a),
   'roles',(select jsonb_agg(jsonb_build_object('role',r.rolname,'usage',has_schema_privilege(r.oid,n.oid,'USAGE'),
    'create',has_schema_privilege(r.oid,n.oid,'CREATE')) order by r.rolname) from roles r)) order by n.nspname) from namespaces n),
 'default_privileges',(select coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),
   'schema',case when d.defaclnamespace=0 then '*' else d.defaclnamespace::regnamespace::text end,
   'object_type',d.defaclobjtype,'acl',(select jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),
    'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
    'privilege',a.privilege_type,'grant_option',a.is_grantable) order by a.grantee,a.privilege_type) from aclexplode(d.defaclacl) a))
   order by d.defaclrole,d.defaclnamespace,d.defaclobjtype),'[]'::jsonb) from pg_default_acl d
   where (d.defaclobjtype='f' and (d.defaclnamespace=0 or d.defaclnamespace in(select oid from namespaces))) or d.defaclobjtype='n'),
 'source_tables',(select coalesce(jsonb_agg(jsonb_build_object('table',s.relname,'rls',s.relrowsecurity,'force_rls',s.relforcerowsecurity,
  'roles',(select jsonb_agg(jsonb_build_object('role',r.rolname,'table_select',has_table_privilege(r.oid,s.oid,'SELECT'))) from roles r)) order by s.relname),'[]'::jsonb) from sources s),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'command',cmd,'roles',roles,'using',qual) order by tablename,policyname),'[]'::jsonb)
  from pg_policies where schemaname='public' and tablename in('products','profiles','auctions')),
 'existing_indexes',(select coalesce(jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef) order by tablename,indexname),'[]'::jsonb)
  from pg_indexes where schemaname='public' and tablename in('products','auctions')),
 'source_columns',(select coalesce(jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type,'nullable',is_nullable) order by table_name,ordinal_position),'[]'::jsonb)
  from information_schema.columns where table_schema='public' and table_name in('products','profiles','auctions')),
 'icu',(select coalesce(jsonb_agg(jsonb_build_object('name',collname,'provider',collprovider,'deterministic',collisdeterministic,
  'recorded_version',collversion,'actual_version',pg_collation_actual_version(oid))),'[]'::jsonb) from pg_collation
  where collnamespace='pg_catalog'::regnamespace and collname='und-x-icu'),
 'realtime_public_sources',(select coalesce(jsonb_agg(tablename order by tablename),'[]'::jsonb) from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public' and tablename in('products','auctions')),
 'orders_object_present',to_regclass('public.orders') is not null,
 'app_private_present',to_regnamespace('app_private') is not null,
 'cash_or_payments_activation_inferred',false,
 'api_schema_exposure_checked',false,
 'runtime_rls_and_pg17_validation_required',true
);
