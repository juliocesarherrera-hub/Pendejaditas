-- LOCAL EPHEMERAL FIXTURE ONLY. Not a migration. Do not run in SQL Editor.
-- No project migration, extension, role, index or service is installed here.
do $$ begin
 if current_setting('pjd.catalog_lab',true) is distinct from 'ephemeral-pglite'
    or position('PGlite' in version())=0 then
  raise exception 'This fixture requires the isolated in-memory runner.';
 end if;
end $$;

create temporary table catalog_products (
 id uuid not null,owner_id uuid not null,title text not null,category text not null,
 sale_type text not null,price numeric(12,0) not null,created_at timestamptz not null
);
create temporary table catalog_auctions (
 id uuid not null,product_id uuid not null,seller_id uuid not null,
 initial_price bigint not null,highest_amount bigint,bid_count integer not null,
 status text not null,revision integer not null
);

-- Deliberately STABLE, not a claim that this candidate is safe for an index.
-- The runner replaces the marker with one fixed, existing ICU collation.
-- No CREATE COLLATION is performed. A PG17 target must be checked separately.
create function pg_temp.catalog_key_v1(value text) returns text
language plpgsql stable strict set search_path='' as $$
declare part text; parts text[]; folded text; result text:=''; i integer:=0;
begin
 folded:=pg_catalog.lower(pg_catalog.normalize(value,'NFC') /*__CASE_COLLATION__*/);
 parts:=pg_catalog.string_to_array(folded,U&'\00f1');
 foreach part in array parts loop
  if i>0 then result:=result||U&'\00f1';end if;
  result:=result||pg_catalog.normalize(pg_catalog.regexp_replace(
    pg_catalog.normalize(part,'NFD'),U&'[\0300-\036f]','','g'),'NFC');
  i:=i+1;
 end loop;
 return result;
end $$;

create function pg_temp.catalog_like_literal(value text) returns text
language sql immutable strict set search_path='' as $$
 select '%'||pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(value,'!','!!'),'%','!%'),'_','!_')||'%'
$$;
