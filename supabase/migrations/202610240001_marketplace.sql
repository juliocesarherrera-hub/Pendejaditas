-- Run once in this project's Supabase SQL Editor, as the project administrator.
-- No seed users, listings, transactions or payment functions are created.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 60),
  bio text not null default '' check (char_length(bio) <= 500),
  city text not null default 'Querétaro' check (city = 'Querétaro'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 5 and 90),
  description text not null check (char_length(btrim(description)) between 15 and 1500),
  category text not null check (category in ('Consolas','Videojuegos','Accesorios','Componentes','Coleccionables')),
  condition text not null check (condition in ('Nuevo','Como nuevo','Buen estado','Con detalles')),
  sale_type text not null check (sale_type in ('fixed','offers')),
  price numeric(12,0) not null check (price between 1 and 1000000),
  area text not null check (area in ('Centro','Juriquilla','Centro Sur','El Refugio','Milenio III','Zibatá','Otra zona de Querétaro')),
  image_path text not null unique check (image_path ~ ('^' || owner_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_owner_idx on public.products(owner_id);
create index products_created_idx on public.products(created_at desc);
create index products_category_idx on public.products(category);

create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = clock_timestamp(); return new; end;
$$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger products_updated before update on public.products for each row execute function public.set_updated_at();

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare chosen_name text;
begin
  chosen_name := btrim(coalesce(new.raw_user_meta_data->>'display_name', ''));
  if char_length(chosen_name) not between 2 and 60 then chosen_name := 'Miembro de Pendejaditas'; end if;
  insert into public.profiles(id, display_name) values(new.id, chosen_name);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into public.profiles(id, display_name)
select id, case when char_length(btrim(coalesce(raw_user_meta_data->>'display_name',''))) between 2 and 60
  then btrim(raw_user_meta_data->>'display_name') else 'Miembro de Pendejaditas' end from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
revoke all on public.profiles, public.products from anon, authenticated;
grant select on public.profiles, public.products to anon, authenticated;
grant update(display_name, bio, city) on public.profiles to authenticated;
grant insert(id, owner_id, title, description, category, condition, sale_type, price, area, image_path) on public.products to authenticated;
grant update(title, description, category, condition, sale_type, price, area, image_path) on public.products to authenticated;
grant delete on public.products to authenticated;

create policy profiles_public_read on public.profiles for select to anon, authenticated using (true);
create policy profiles_owner_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy products_public_read on public.products for select to anon, authenticated using (true);
create policy products_owner_insert on public.products for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy products_owner_update on public.products for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy products_owner_delete on public.products for delete to authenticated using ((select auth.uid()) = owner_id);

-- Public bucket: only product photography belongs here; never identity documents.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/jpeg','image/png','image/webp']);
create policy product_images_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy product_images_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and name ~ ('^' || (select auth.uid()::text) || '/[0-9a-f-]{36}\.(jpg|png|webp)$'));
-- No object UPDATE policy: images are immutable, replacements use a new path.
create policy product_images_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid()::text)
    and not exists (select 1 from public.products p where p.image_path = name));

create function public.validate_product_image() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from storage.objects o where o.bucket_id = 'product-images'
    and o.name = new.image_path and o.owner_id = new.owner_id::text) then
    raise exception 'La fotografía debe existir y pertenecer al vendedor.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger products_image_exists before insert or update of image_path on public.products
  for each row execute function public.validate_product_image();

-- The app only announces a connected backend after this versioned health check.
create function public.marketplace_health() returns integer language sql stable security invoker set search_path = '' as $$ select 2 $$;
revoke all on function public.handle_new_user(), public.validate_product_image(), public.set_updated_at() from public, anon, authenticated;
revoke all on function public.marketplace_health() from public;
grant execute on function public.marketplace_health() to anon, authenticated;
commit;
