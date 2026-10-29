-- DRAFT ONLY. Not authorized for installation. No indexes/extensions/backfill.
-- Kept OUTSIDE supabase/migrations to avoid applying pending 008 accidentally.
-- The workflow guard is an accident barrier, NOT an authorization mechanism.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$ begin
 if current_setting('pjd.catalog_draft_validation',true) is distinct from 'isolated-local-only' then
  raise exception 'Borrador bloqueado: validar 17.11, RLS y rendimiento; no instalar.';
 end if;
 if current_setting('server_version_num')::integer<>170011 and not
   (current_setting('server_version_num')::integer=180006 and position('PGlite' in version())>0) then
  raise exception 'Motor de validación no revisado.';
 end if;
 if current_setting('server_encoding')<>'UTF8' then raise exception 'Se requiere UTF8.';end if;
 if to_regnamespace('catalog_private') is not null
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='catalog_page_v1') then
  raise exception 'Ya existen objetos de catálogo; diagnosticar, no repetir.';
 end if;
 if to_regclass('public.products') is null or to_regclass('public.profiles') is null or to_regclass('public.auctions') is null
    or to_regprocedure('auth.uid()') is null then raise exception 'Faltan dependencias 001/005/Auth.';end if;
 if exists(select 1 from pg_class where oid in('public.products'::regclass,'public.profiles'::regclass,'public.auctions'::regclass) and not relrowsecurity) then
  raise exception 'Las fuentes requieren RLS habilitada.';
 end if;
 if not exists(select 1 from pg_collation where collname='und-x-icu' and collnamespace='pg_catalog'::regnamespace and collprovider='i' and collisdeterministic
   and collversion is not null and collversion=pg_collation_actual_version(oid)) then raise exception 'ICU determinista no disponible o versión pendiente de revisar.';end if;
 -- Bind required column names/types without reading a single business row.
 perform p.id,p.owner_id,p.title,p.category,p.condition,p.sale_type,p.price,p.area,p.image_path,p.created_at,p.updated_at,
   pr.id,pr.display_name,a.id,a.product_id,a.seller_id,a.initial_price,a.highest_amount,a.bid_count,a.status,a.revision,a.starts_at,a.ends_at
  from public.products p left join public.profiles pr on pr.id=p.owner_id left join public.auctions a on a.product_id=p.id where false;
end $$;

create schema catalog_private;
revoke all on schema catalog_private from public,anon,authenticated;

create function catalog_private.search_key_v1(value text) returns text
language plpgsql stable strict security invoker set search_path='' as $$
declare folded text;part text;result text:='';i integer:=0;
begin
 -- Check bytes before character scans/ICU, including calls outside the RPC.
 if octet_length(value)>512 then raise exception 'Entrada no admitida.' using errcode='22023';end if;
 if char_length(value)>90 then raise exception 'Entrada no admitida.' using errcode='22023';end if;
 folded:=pg_catalog.lower(pg_catalog.normalize(value,'NFC') collate pg_catalog."und-x-icu");
 foreach part in array pg_catalog.string_to_array(folded,U&'\00f1') loop
  if i>0 then result:=result||U&'\00f1';end if;
  result:=result||pg_catalog.normalize(pg_catalog.regexp_replace(pg_catalog.normalize(part,'NFD'),U&'[\0300-\036f]','','g'),'NFC');
  i:=i+1;
 end loop;
 -- Canonical decomposition can expand a valid raw title/search (e.g. Tibetan).
 if octet_length(result)>2048 then raise exception 'Entrada no admitida.' using errcode='22023';end if;
 if char_length(result)>512 then raise exception 'Entrada no admitida.' using errcode='22023';end if;
 return result;
end $$;

create function catalog_private.trim_v1(value text) returns text
language plpgsql immutable strict security invoker set search_path='' as $$
begin
 if octet_length(value)>512 then raise exception 'Entrada no admitida.' using errcode='22023';end if;
 if char_length(value)>90 then raise exception 'Entrada no admitida.' using errcode='22023';end if;
 return pg_catalog.btrim(value,U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
end;
$$;

create function catalog_private.pattern_v1(value text) returns text
language plpgsql immutable strict security invoker set search_path='' as $$
begin
 if octet_length(value)>2048 then raise exception 'Entrada no admitida.' using errcode='22023';end if;
 if char_length(value)>512 then raise exception 'Entrada no admitida.' using errcode='22023';end if;
 return '%'||pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(value,'!','!!'),'%','!%'),'_','!_')||'%';
end $$;

create function catalog_private.cursor_time_v1(value text) returns timestamptz
language plpgsql stable strict security invoker set search_path='' as $$
declare t timestamptz;
begin
 -- Exactly 27 ASCII bytes: no regex/date conversion on oversized input.
 if octet_length(value)<>27 then return null;end if;
 if value collate "C" !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$' or left(value,4)='0000' then return null;end if;
 begin t:=value::timestamptz;exception when invalid_datetime_format or datetime_field_overflow then return null;end;
 if pg_catalog.to_char(t at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')<>value then return null;end if;
 return t;
end $$;

create function catalog_private.fingerprint_v1(category text,sale_type text,term text,low integer,high integer,sort text,page_size integer) returns text
language plpgsql stable security invoker set search_path='' as $$
declare result text;term_length integer;
begin
 if sale_type is null or term is null or sort is null or page_size is null then
  raise exception 'Entrada no admitida.' using errcode='22023';end if;
 -- Scalar size checks precede comparisons, character scans and JSON/hash work.
 if category is not null then
  if octet_length(category)>64 then raise exception 'Entrada no admitida.' using errcode='22023';end if;
 end if;
 if octet_length(sale_type)>7 or octet_length(sort)>10 or octet_length(term)>2048 then
  raise exception 'Entrada no admitida.' using errcode='22023';end if;
 term_length:=char_length(term);
 if term_length>512 or term_length=1 then raise exception 'Entrada no admitida.' using errcode='22023';end if;
 if category is not null then
  if char_length(category)>32 or category not in('Consolas','Videojuegos','Accesorios','Componentes','Coleccionables') then
   raise exception 'Entrada no admitida.' using errcode='22023';end if;
 end if;
 if sale_type not in('all','fixed','offers','auction') or sort not in('recent','price_asc','price_desc')
  or page_size not between 1 and 12 or (low is not null and low not between 0 and 1000000)
  or (high is not null and high not between 0 and 1000000) or low>high then
  raise exception 'Entrada no admitida.' using errcode='22023';end if;
 -- Hash the already-normalized term unchanged; never truncate or fold it twice.
 select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('['||
   (select pg_catalog.string_agg(e.value::text,',' order by e.ord)
    from pg_catalog.jsonb_array_elements(pg_catalog.jsonb_build_array(
     'catalog-v1','es-nfc-preserve-enye-v1','public-catalog-v1',auth.uid(),category,sale_type,term,low,high,sort,page_size))
     with ordinality as e(value,ord))||']','UTF8')),'hex') into result;
 return result;
end;
$$;

create function public.catalog_page_v1(p_request jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' set statement_timeout='2s' as $$
declare
 v jsonb; c jsonb;pos jsonb;v_category text;v_type text;v_term text;v_trimmed text;v_sort text;
 v_low integer;v_high integer;v_size integer;n numeric;v_fp text;v_id uuid;v_time timestamptz;v_price integer;
 v_rows jsonb;v_items jsonb;v_next jsonb:=null;v_more boolean;last_item jsonb;
 v_server_time text:=pg_catalog.to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
begin
 if jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text)>4096 then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 if exists(select 1 from jsonb_object_keys(p_request) k where k not in('category','sale_type','search','min_price','max_price','sort','page_size','cursor')) then
  return jsonb_build_object('ok',false,'code','invalid_request');end if;
 v:=jsonb_build_object('category',null,'sale_type','all','search','','min_price',null,'max_price',null,'sort','recent','page_size',12,'cursor',null)||p_request;
 if (v->'category'<>'null'::jsonb and (jsonb_typeof(v->'category')<>'string' or v->>'category' not in('Consolas','Videojuegos','Accesorios','Componentes','Coleccionables')))
  or jsonb_typeof(v->'sale_type')<>'string' or v->>'sale_type' not in('all','fixed','offers','auction')
  or jsonb_typeof(v->'sort')<>'string' or v->>'sort' not in('recent','price_asc','price_desc')
  or jsonb_typeof(v->'search')<>'string' or char_length(v->>'search')>90 or octet_length(v->>'search')>512
  or jsonb_typeof(v->'page_size')<>'number' then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 n:=(v->>'page_size')::numeric;
 if n<>trunc(n) or n<1 or n>12 then return jsonb_build_object('ok',false,'code','invalid_request');end if;v_size:=n::integer;
 if v->'min_price'<>'null'::jsonb then
  if jsonb_typeof(v->'min_price')<>'number' then return jsonb_build_object('ok',false,'code','invalid_request');end if;
  n:=(v->>'min_price')::numeric;if n<>trunc(n) or n<0 or n>1000000 then return jsonb_build_object('ok',false,'code','invalid_request');end if;v_low:=n::integer;
 end if;
 if v->'max_price'<>'null'::jsonb then
  if jsonb_typeof(v->'max_price')<>'number' then return jsonb_build_object('ok',false,'code','invalid_request');end if;
  n:=(v->>'max_price')::numeric;if n<>trunc(n) or n<0 or n>1000000 then return jsonb_build_object('ok',false,'code','invalid_request');end if;v_high:=n::integer;
 end if;
 if v_low>v_high then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 v_category:=v->>'category';v_type:=v->>'sale_type';v_sort:=v->>'sort';
 v_trimmed:=catalog_private.trim_v1(v->>'search');v_term:=catalog_private.search_key_v1(v_trimmed);
 if v_trimmed<>'' and v_term='' then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 if char_length(v_term)=1 then return jsonb_build_object('ok',false,'code','query_too_short');end if;
 v_fp:=catalog_private.fingerprint_v1(v_category,v_type,v_term,v_low,v_high,v_sort,v_size);
 c:=v->'cursor';
 if c<>'null'::jsonb then
  if jsonb_typeof(c)<>'object' or octet_length(c::text)>1536 then return jsonb_build_object('ok',false,'code','invalid_cursor');end if;
  if (select count(*) from jsonb_object_keys(c))<>3 or not(c ?& array['v','fingerprint','position']) or c->'v'<>'1'::jsonb
   or jsonb_typeof(c->'fingerprint')<>'string' or c->>'fingerprint' collate "C" !~ '^[0-9a-f]{64}$' or c->>'fingerprint'<>v_fp
   or jsonb_typeof(c->'position')<>'object' then return jsonb_build_object('ok',false,'code','invalid_cursor');end if;
  pos:=c->'position';
  if (select count(*) from jsonb_object_keys(pos))<>2 or jsonb_typeof(pos->'id') is distinct from 'string'
   or pos->>'id' collate "C" !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then return jsonb_build_object('ok',false,'code','invalid_cursor');end if;
  v_id:=(pos->>'id')::uuid;
  if v_sort='recent' then
   if not(pos ? 'created_at') or jsonb_typeof(pos->'created_at')<>'string' then return jsonb_build_object('ok',false,'code','invalid_cursor');end if;
   v_time:=catalog_private.cursor_time_v1(pos->>'created_at');
   if v_time is null then return jsonb_build_object('ok',false,'code','invalid_cursor');end if;
  else
   if not(pos ? 'price') or jsonb_typeof(pos->'price')<>'number' then return jsonb_build_object('ok',false,'code','invalid_cursor');end if;
   n:=(pos->>'price')::numeric;
   if n<>trunc(n) or n<1 or n>1000000 then return jsonb_build_object('ok',false,'code','invalid_cursor');end if;v_price:=n::integer;
  end if;
 end if;
 if v_sort='recent' then
  with effective as (
 select p.id,p.owner_id,p.title,p.category,p.condition,p.sale_type,p.area,p.image_path,p.created_at,p.updated_at,
  coalesce(pr.display_name,'Perfil no disponible') seller_name,
  case when p.sale_type in('fixed','offers') then p.price
   when a.id is not null and a.seller_id=p.owner_id and a.initial_price between 1 and 1000000 and a.revision>0
    and a.status in('scheduled','active','ended_no_bids','ended_winner','cancelled') and isfinite(a.starts_at) and isfinite(a.ends_at)
   then case when a.bid_count=0 and a.highest_amount is null then a.initial_price
    when a.bid_count>0 and a.highest_amount between 1 and 1000000 then a.highest_amount end end effective_price,
  case when p.sale_type='fixed' then 'fixed_reference' when p.sale_type='offers' then 'negotiable_reference'
    when a.bid_count=0 then 'auction_initial' else 'auction_highest_valid' end price_kind,
  case when p.sale_type='auction' then jsonb_build_object('id',a.id,'status',a.status,'initial_price',a.initial_price,
   'highest_amount',a.highest_amount,'bid_count',a.bid_count,'revision',a.revision,
   'starts_at',to_char(a.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'ends_at',to_char(a.ends_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) else null end auction
 from public.products p left join public.profiles pr on pr.id=p.owner_id
 left join public.auctions a on a.product_id=p.id and p.sale_type='auction'
 where isfinite(p.created_at) and isfinite(p.updated_at)
), eligible as (
 select e.* from effective e where effective_price between 1 and 1000000
  and (v_category is null or category=v_category) and (v_type='all' or sale_type=v_type)
  and (v_term='' or catalog_private.search_key_v1(title) collate "C" like catalog_private.pattern_v1(v_term) escape '!')
  and (v_low is null or effective_price>=v_low) and (v_high is null or effective_price<=v_high)
)
  select coalesce(jsonb_agg(q.card order by created_at desc,id desc),'[]'::jsonb) into v_rows
  from (select id,created_at,effective_price,jsonb_build_object('id',id,'owner_id',owner_id,'seller_name',seller_name,'title',title,'category',category,'condition',condition,
   'sale_type',sale_type,'area',area,'image_path',image_path,
   'created_at',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'updated_at',to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'effective_price',effective_price,'currency','MXN','price_kind',price_kind,'auction',auction) card from eligible
   where v_id is null or (created_at,id)<(v_time,v_id) order by created_at desc,id desc limit v_size+1) q;
 elsif v_sort='price_asc' then
  with effective as (
 select p.id,p.owner_id,p.title,p.category,p.condition,p.sale_type,p.area,p.image_path,p.created_at,p.updated_at,
  coalesce(pr.display_name,'Perfil no disponible') seller_name,
  case when p.sale_type in('fixed','offers') then p.price
   when a.id is not null and a.seller_id=p.owner_id and a.initial_price between 1 and 1000000 and a.revision>0
    and a.status in('scheduled','active','ended_no_bids','ended_winner','cancelled') and isfinite(a.starts_at) and isfinite(a.ends_at)
   then case when a.bid_count=0 and a.highest_amount is null then a.initial_price
    when a.bid_count>0 and a.highest_amount between 1 and 1000000 then a.highest_amount end end effective_price,
  case when p.sale_type='fixed' then 'fixed_reference' when p.sale_type='offers' then 'negotiable_reference'
    when a.bid_count=0 then 'auction_initial' else 'auction_highest_valid' end price_kind,
  case when p.sale_type='auction' then jsonb_build_object('id',a.id,'status',a.status,'initial_price',a.initial_price,
   'highest_amount',a.highest_amount,'bid_count',a.bid_count,'revision',a.revision,
   'starts_at',to_char(a.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'ends_at',to_char(a.ends_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) else null end auction
 from public.products p left join public.profiles pr on pr.id=p.owner_id
 left join public.auctions a on a.product_id=p.id and p.sale_type='auction'
 where isfinite(p.created_at) and isfinite(p.updated_at)
), eligible as (
 select e.* from effective e where effective_price between 1 and 1000000
  and (v_category is null or category=v_category) and (v_type='all' or sale_type=v_type)
  and (v_term='' or catalog_private.search_key_v1(title) collate "C" like catalog_private.pattern_v1(v_term) escape '!')
  and (v_low is null or effective_price>=v_low) and (v_high is null or effective_price<=v_high)
)
  select coalesce(jsonb_agg(q.card order by effective_price asc,id asc),'[]'::jsonb) into v_rows
  from (select id,created_at,effective_price,jsonb_build_object('id',id,'owner_id',owner_id,'seller_name',seller_name,'title',title,'category',category,'condition',condition,
   'sale_type',sale_type,'area',area,'image_path',image_path,
   'created_at',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'updated_at',to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'effective_price',effective_price,'currency','MXN','price_kind',price_kind,'auction',auction) card from eligible
   where v_id is null or (effective_price,id)>(v_price,v_id) order by effective_price asc,id asc limit v_size+1) q;
 elsif v_sort='price_desc' then
  with effective as (
 select p.id,p.owner_id,p.title,p.category,p.condition,p.sale_type,p.area,p.image_path,p.created_at,p.updated_at,
  coalesce(pr.display_name,'Perfil no disponible') seller_name,
  case when p.sale_type in('fixed','offers') then p.price
   when a.id is not null and a.seller_id=p.owner_id and a.initial_price between 1 and 1000000 and a.revision>0
    and a.status in('scheduled','active','ended_no_bids','ended_winner','cancelled') and isfinite(a.starts_at) and isfinite(a.ends_at)
   then case when a.bid_count=0 and a.highest_amount is null then a.initial_price
    when a.bid_count>0 and a.highest_amount between 1 and 1000000 then a.highest_amount end end effective_price,
  case when p.sale_type='fixed' then 'fixed_reference' when p.sale_type='offers' then 'negotiable_reference'
    when a.bid_count=0 then 'auction_initial' else 'auction_highest_valid' end price_kind,
  case when p.sale_type='auction' then jsonb_build_object('id',a.id,'status',a.status,'initial_price',a.initial_price,
   'highest_amount',a.highest_amount,'bid_count',a.bid_count,'revision',a.revision,
   'starts_at',to_char(a.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'ends_at',to_char(a.ends_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) else null end auction
 from public.products p left join public.profiles pr on pr.id=p.owner_id
 left join public.auctions a on a.product_id=p.id and p.sale_type='auction'
 where isfinite(p.created_at) and isfinite(p.updated_at)
), eligible as (
 select e.* from effective e where effective_price between 1 and 1000000
  and (v_category is null or category=v_category) and (v_type='all' or sale_type=v_type)
  and (v_term='' or catalog_private.search_key_v1(title) collate "C" like catalog_private.pattern_v1(v_term) escape '!')
  and (v_low is null or effective_price>=v_low) and (v_high is null or effective_price<=v_high)
)
  select coalesce(jsonb_agg(q.card order by effective_price desc,id desc),'[]'::jsonb) into v_rows
  from (select id,created_at,effective_price,jsonb_build_object('id',id,'owner_id',owner_id,'seller_name',seller_name,'title',title,'category',category,'condition',condition,
   'sale_type',sale_type,'area',area,'image_path',image_path,
   'created_at',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'updated_at',to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'effective_price',effective_price,'currency','MXN','price_kind',price_kind,'auction',auction) card from eligible
   where v_id is null or (effective_price,id)<(v_price,v_id) order by effective_price desc,id desc limit v_size+1) q;
 end if;
 select coalesce(jsonb_agg(e.value order by e.ord),'[]'::jsonb) into v_items
  from jsonb_array_elements(v_rows) with ordinality e(value,ord) where e.ord<=v_size;
 v_more:=jsonb_array_length(v_rows)>v_size;
 if v_more then
  last_item:=v_items->(v_size-1);
  v_next:=jsonb_build_object('v',1,'fingerprint',v_fp,'position',
   case when v_sort='recent' then jsonb_build_object('created_at',last_item->'created_at','id',last_item->'id')
    else jsonb_build_object('price',last_item->'effective_price','id',last_item->'id') end);
 end if;
 return jsonb_build_object('ok',true,'version','catalog-v1','normalization','es-nfc-preserve-enye-v1',
  'server_time',v_server_time,'consistency','statement_snapshot_only','payments_enabled',false,'cash_enabled',false,
  'items',v_items,'page',jsonb_build_object('size',v_size,'returned',jsonb_array_length(v_items),'has_more',v_more,'next_cursor',v_next));
exception
 when query_canceled then raise; -- Preserve timeout for sanitized transport classification.
 when insufficient_privilege then raise; -- Do not turn a permission failure into an empty catalog.
 when others then return jsonb_build_object('ok',false,'code','unavailable');
end $$;

-- Reset ACLs of these SIX NEW functions, including any custom default grantee.
-- Never use ALL FUNCTIONS IN SCHEMA, ALTER DEFAULT PRIVILEGES, or role changes.
-- CASCADE removes only dependent privilege grants on each NEW function.
do $$ declare signature text;f record;g record;recipient text;
begin
 foreach signature in array array[
  'catalog_private.search_key_v1(text)','catalog_private.trim_v1(text)',
  'catalog_private.pattern_v1(text)','catalog_private.cursor_time_v1(text)',
  'catalog_private.fingerprint_v1(text,text,text,integer,integer,text,integer)',
  'public.catalog_page_v1(jsonb)'] loop
  select p.oid,p.proowner,p.proacl into strict f from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure(signature);
  for g in select distinct a.grantee from pg_catalog.aclexplode(coalesce(f.proacl,pg_catalog.acldefault('f',f.proowner))) a
    where a.grantee<>f.proowner loop
   recipient:=case when g.grantee=0 then 'PUBLIC' else pg_catalog.quote_ident(pg_catalog.pg_get_userbyid(g.grantee)) end;
   execute pg_catalog.format('revoke all on function %s from %s cascade',signature,recipient);
  end loop;
 end loop;
end $$;
grant usage on schema catalog_private to anon,authenticated;
grant execute on function catalog_private.search_key_v1(text),catalog_private.trim_v1(text),
 catalog_private.pattern_v1(text),catalog_private.cursor_time_v1(text),
 catalog_private.fingerprint_v1(text,text,text,integer,integer,text,integer),public.catalog_page_v1(jsonb)
 to anon,authenticated;

-- Fail closed for unexpected inherited access; do NOT alter memberships,
-- defaults, public-schema ACLs or any existing object to make this pass.
do $$ declare signature text;f record;n record;
begin
 if exists(select 1 from pg_catalog.pg_roles r where r.rolname in('anon','authenticated') and
   (r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb or r.rolreplication)) then
  raise exception 'Roles de cliente privilegiados: revisar sin modificar roles existentes.';
 end if;
 select oid,nspowner,nspacl into strict n from pg_catalog.pg_namespace where nspname='catalog_private';
 if exists(select 1 from pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
   where a.grantee<>n.nspowner and (a.grantee not in('anon'::regrole::oid,'authenticated'::regrole::oid)
     or a.privilege_type<>'USAGE' or a.is_grantable)) then
  raise exception 'ACL inesperada del esquema nuevo: requiere revision separada.';
 end if;
 foreach signature in array array[
  'catalog_private.search_key_v1(text)','catalog_private.trim_v1(text)',
  'catalog_private.pattern_v1(text)','catalog_private.cursor_time_v1(text)',
  'catalog_private.fingerprint_v1(text,text,text,integer,integer,text,integer)',
  'public.catalog_page_v1(jsonb)'] loop
  select p.oid,p.proowner,p.proacl into strict f from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure(signature);
  if exists(select 1 from pg_catalog.aclexplode(coalesce(f.proacl,pg_catalog.acldefault('f',f.proowner))) a
    where a.grantee<>f.proowner and (a.grantee not in('anon'::regrole::oid,'authenticated'::regrole::oid)
      or a.privilege_type<>'EXECUTE' or a.is_grantable)) then
   raise exception 'ACL inesperada en funcion nueva; instalacion detenida.';
  end if;
  if exists(select 1 from pg_catalog.pg_roles r where r.rolname in('anon','authenticated') and
    (not pg_catalog.has_function_privilege(r.oid,f.oid,'EXECUTE') or pg_catalog.pg_has_role(r.oid,f.proowner,'MEMBER'))) then
   raise exception 'Permisos de cliente incompatibles; no se modifican membresias.';
  end if;
  if exists(select 1 from pg_catalog.pg_roles r where r.rolname not in('anon','authenticated')
    and not r.rolsuper and not pg_catalog.pg_has_role(r.oid,f.proowner,'USAGE')
    and pg_catalog.has_function_privilege(r.oid,f.oid,'EXECUTE')) then
   raise exception 'EXECUTE heredado inesperado: revisar membresias sin cambiarlas.';
  end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
-- END DRAFT 202610280009 catalog v1. No installation authorized.
