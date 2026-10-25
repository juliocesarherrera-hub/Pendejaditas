-- NEW migration. Run once, whole file, only after enabling Supabase Cron.
-- No remote execution by the development agent. No payments or sample listings.
begin;

do $$
begin
  if not exists(select 1 from pg_extension where extname='pg_cron') then
    raise exception 'Habilita pg_cron desde Integrations > Cron antes de instalar subastas.';
  end if;
  if to_regclass('public.products') is null or to_regclass('public.user_blocks') is null
     or to_regclass('public.exchange_requests') is null then
    raise exception 'Faltan tablas previas. No repitas migraciones: revisa la instalación.';
  end if;
  if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
    raise exception 'Falta supabase_realtime.';
  end if;
  if exists(select 1 from cron.job where jobname='pendejaditas-auction-clock') then
    raise exception 'La tarea de subastas ya existe. Revisa antes de repetir esta migración.';
  end if;
end; $$;

create table public.auctions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id),
  seller_id uuid not null references public.profiles(id),
  initial_price bigint not null check(initial_price between 1 and 1000000),
  min_increment bigint not null check(min_increment between 1 and 100000),
  duration_hours integer not null check(duration_hours in(1,24,48,72,168)),
  terms text not null check(char_length(btrim(terms)) between 20 and 3000),
  starts_at timestamptz not null, original_ends_at timestamptz not null,
  ends_at timestamptz not null, closed_at timestamptz,
  status text not null check(status in('scheduled','active','ended_no_bids','ended_winner','cancelled')),
  formalization_status text not null default 'none' check(formalization_status in('none','pending','coordination')),
  highest_amount bigint check(highest_amount between 1 and 1000000),
  leader_alias text, highest_bid_id uuid,
  bid_count integer not null default 0 check(bid_count>=0),
  extension_count integer not null default 0 check(extension_count>=0),
  revision integer not null default 1 check(revision>0),
  cancellation_reason text check(char_length(cancellation_reason) between 10 and 500),
  created_at timestamptz not null default clock_timestamp(),
  check(original_ends_at>starts_at and ends_at>=original_ends_at),
  check((bid_count=0 and highest_amount is null and highest_bid_id is null and leader_alias is null)
     or (bid_count>0 and highest_amount is not null and highest_bid_id is not null and leader_alias is not null))
);
create index auctions_clock_idx on public.auctions(status,ends_at);
create index auctions_seller_idx on public.auctions(seller_id,created_at);
create table public.auction_photos (
  auction_id uuid not null references public.auctions(id),
  position integer not null check(position between 0 and 4),
  image_path text not null unique, primary key(auction_id,position)
);
create table public.auction_bids (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id),
  bidder_id uuid not null references public.profiles(id),
  bidder_alias text not null,
  amount bigint not null check(amount between 1 and 1000000),
  sequence integer not null check(sequence>0), client_nonce uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(auction_id,sequence),unique(auction_id,bidder_id,client_nonce),
  unique(auction_id,id)
);
create index auction_bids_user_idx on public.auction_bids(bidder_id,created_at);
alter table public.auctions add constraint auction_highest_bid_fk
  foreign key(id,highest_bid_id) references public.auction_bids(auction_id,id);
-- Sanitized public history; bidder identity and nonce stay in the private ledger.
create table public.auction_bid_history (
  bid_id uuid primary key references public.auction_bids(id),
  auction_id uuid not null references public.auctions(id),
  sequence integer not null, amount bigint not null,
  bidder_alias text not null, created_at timestamptz not null,
  unique(auction_id,sequence)
);
create table public.auction_results (
  auction_id uuid primary key references public.auctions(id),
  winning_bid_id uuid not null references public.auction_bids(id),
  winner_id uuid not null references public.profiles(id),
  amount bigint not null,
  exchange_id uuid unique references public.exchange_requests(id),
  created_at timestamptz not null default clock_timestamp()
);
create table public.auction_bid_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id),
  auction_id uuid references public.auctions(id),
  outcome text not null, created_at timestamptz not null default clock_timestamp()
);
create index auction_attempts_user_idx on public.auction_bid_attempts(user_id,created_at);
create table public.auction_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  auction_id uuid not null references public.auctions(id),
  kind text not null check(kind in('outbid','winner_provisional','seller_result','cancelled')),
  event_key text not null, read_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique(user_id,auction_id,event_key)
);
create index auction_notifications_user_idx on public.auction_notifications(user_id,created_at);
create table public.auction_audit_events (
  id bigint generated always as identity primary key,
  auction_id uuid not null references public.auctions(id),
  actor_id uuid references public.profiles(id),
  kind text not null, details jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp()
);
create table public.auction_risk_flags (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id),
  rule text not null, evidence jsonb not null,
  review_status text not null default 'pending' check(review_status in('pending','reviewed')),
  created_at timestamptz not null default clock_timestamp(), unique(auction_id,rule)
);

alter table public.auctions enable row level security;
alter table public.auction_photos enable row level security;
alter table public.auction_bids enable row level security;
alter table public.auction_bid_history enable row level security;
alter table public.auction_results enable row level security;
alter table public.auction_bid_attempts enable row level security;
alter table public.auction_notifications enable row level security;
alter table public.auction_audit_events enable row level security;
alter table public.auction_risk_flags enable row level security;
revoke all on public.auctions,public.auction_photos,public.auction_bids,public.auction_bid_history,
  public.auction_results,public.auction_bid_attempts,public.auction_notifications,
  public.auction_audit_events,public.auction_risk_flags from public,anon,authenticated;
grant select on public.auctions,public.auction_photos,public.auction_bid_history to anon,authenticated;
grant select on public.auction_bids,public.auction_results,public.auction_notifications to authenticated;
create policy auctions_public_read on public.auctions for select to anon,authenticated using(true);
create policy auction_photos_public_read on public.auction_photos for select to anon,authenticated using(true);
create policy auction_history_public_read on public.auction_bid_history for select to anon,authenticated using(true);
create policy auction_bids_party_read on public.auction_bids for select to authenticated
  using(bidder_id=(select auth.uid()) or exists(select 1 from public.auctions a where a.id=auction_id and a.seller_id=(select auth.uid())));
create policy auction_results_party_read on public.auction_results for select to authenticated
  using(winner_id=(select auth.uid()) or exists(select 1 from public.auctions a where a.id=auction_id and a.seller_id=(select auth.uid())));
create policy auction_notifications_owner_read on public.auction_notifications for select to authenticated using(user_id=(select auth.uid()));
-- Attempts, audit and risk evidence have no frontend SELECT or write grants/policies.
-- This additional RESTRICTIVE policy preserves old photo policies and prevents
-- deleting any photograph referenced by an immutable auction gallery.
create policy auction_photos_preserve on storage.objects as restrictive for delete to authenticated
  using(bucket_id<>'product-images' or not exists(select 1 from public.auction_photos p where p.image_path=name));

-- Broaden one CHECK, preserving all existing rows, columns, grants and RLS.
alter table public.products drop constraint products_sale_type_check;
alter table public.products add constraint products_sale_type_check check(sale_type in('fixed','offers','auction'));

create function public.protect_auction_product() returns trigger
language plpgsql security definer set search_path='' as $$
declare v public.auctions;
begin
  select * into v from public.auctions where product_id=old.id for update;
  if not found then
    if tg_op='UPDATE' and new.sale_type='auction' then raise exception 'Publica la subasta mediante la función del servidor.' using errcode='P0001'; end if;
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_op='DELETE' then raise exception 'La subasta conserva su publicación e historial. Utiliza la cancelación permitida.' using errcode='P0001'; end if;
  -- Only the creation RPC can make this initial conversion; it already holds
  -- the product lock and inserted the otherwise inaccessible auction row.
  if old.sale_type<>'auction' and new.sale_type='auction' and new.price=v.initial_price
    and (to_jsonb(new)-'price'-'sale_type'-'updated_at')=(to_jsonb(old)-'price'-'sale_type'-'updated_at') then return new; end if;
  if (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then
    raise exception 'Los datos y reglas quedan fijos al publicar la subasta.' using errcode='P0001';
  end if;
  return new;
end; $$;
create trigger auction_product_immutable before update or delete on public.products for each row execute function public.protect_auction_product();
create function public.guard_auction_product_insert() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.sale_type='auction' then raise exception 'Crea primero la publicación y usa create_auction.' using errcode='P0001'; end if;
  return new;
end; $$;
create trigger auction_product_insert before insert on public.products for each row execute function public.guard_auction_product_insert();

create function public.create_auction(p_product_id uuid,p_initial_price numeric,p_min_increment numeric,p_duration_hours integer,p_terms text,p_delay_minutes integer default 0,p_image_paths text[] default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_product public.products; v_id uuid; v_now timestamptz; v_paths text[]; v_path text; v_position integer:=0;
begin
  if v_user is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,8));
  select * into v_product from public.products where id=p_product_id for update;
  if not found or v_product.owner_id<>v_user then raise exception 'Publicación no disponible.' using errcode='42501'; end if;
  if exists(select 1 from public.auctions where product_id=p_product_id) then raise exception 'Esta publicación ya tiene una subasta. Actualiza antes de reintentar.' using errcode='P0001'; end if;
  if exists(select 1 from public.exchange_requests where product_id=p_product_id and status in('pending','accepted')) then raise exception 'Resuelve las solicitudes de intercambio antes de subastar.' using errcode='P0001'; end if;
  if p_initial_price is null or p_initial_price not between 1 and 1000000 or p_initial_price<>trunc(p_initial_price)
    or p_min_increment is null or p_min_increment not between 1 and 100000 or p_min_increment<>trunc(p_min_increment)
    or p_duration_hours is null or p_duration_hours not in(1,24,48,72,168)
    or p_delay_minutes is null or p_delay_minutes not between 0 and 1440
    or p_terms is null or char_length(btrim(p_terms)) not between 20 and 3000 then
    raise exception 'Revisa precio, incremento, duración y condiciones.' using errcode='22023';
  end if;
  if (select count(*) from public.auctions where seller_id=v_user and created_at>clock_timestamp()-interval '1 day')>=20 then raise exception 'Límite diario de veinte subastas.' using errcode='P0001'; end if;
  v_paths:=coalesce(p_image_paths,array[v_product.image_path]);
  if cardinality(v_paths) not between 1 and 5 or array_ndims(v_paths)<>1
    or v_paths[array_lower(v_paths,1)] is distinct from v_product.image_path
    or (select count(distinct x) from unnest(v_paths) x)<>cardinality(v_paths) then
    raise exception 'Selecciona de una a cinco fotografías; la primera debe ser la del artículo.' using errcode='22023';
  end if;
  foreach v_path in array v_paths loop
    if v_path is null or v_path !~ ('^'||v_user::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$')
      or not exists(select 1 from storage.objects o where o.bucket_id='product-images' and o.name=v_path and o.owner_id=v_user::text) then
      raise exception 'Cada fotografía debe existir y pertenecer al vendedor.' using errcode='23514';
    end if;
  end loop;
  v_now:=clock_timestamp();
  insert into public.auctions(product_id,seller_id,initial_price,min_increment,duration_hours,terms,starts_at,original_ends_at,ends_at,status)
    values(p_product_id,v_user,p_initial_price::bigint,p_min_increment::bigint,p_duration_hours,btrim(p_terms),
      v_now+make_interval(mins=>p_delay_minutes),v_now+make_interval(mins=>p_delay_minutes,hours=>p_duration_hours),
      v_now+make_interval(mins=>p_delay_minutes,hours=>p_duration_hours),case when p_delay_minutes=0 then 'active' else 'scheduled' end)
    returning id into v_id;
  foreach v_path in array v_paths loop
    insert into public.auction_photos(auction_id,position,image_path) values(v_id,v_position,v_path); v_position:=v_position+1;
  end loop;
  update public.products set sale_type='auction',price=p_initial_price where id=p_product_id;
  insert into public.auction_audit_events(auction_id,actor_id,kind) values(v_id,v_user,'created');
  return v_id;
end; $$;

-- Internal: caller must hold product SHARE then auction UPDATE, in that order.
create function public.settle_auction_locked(p_auction_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v public.auctions; v_bid public.auction_bids; v_now timestamptz:=clock_timestamp();
begin
  select * into v from public.auctions where id=p_auction_id for update;
  if v.status not in('scheduled','active') then return; end if;
  if v.ends_at<=v_now then
    if v.highest_bid_id is null then
      update public.auctions set status='ended_no_bids',closed_at=v_now,revision=revision+1 where id=v.id;
    else
      select * into strict v_bid from public.auction_bids where id=v.highest_bid_id and auction_id=v.id;
      insert into public.auction_results(auction_id,winning_bid_id,winner_id,amount) values(v.id,v_bid.id,v_bid.bidder_id,v_bid.amount);
      update public.auctions set status='ended_winner',formalization_status='pending',closed_at=v_now,revision=revision+1 where id=v.id;
      insert into public.auction_notifications(user_id,auction_id,kind,event_key) values(v_bid.bidder_id,v.id,'winner_provisional','closed') on conflict do nothing;
    end if;
    insert into public.auction_notifications(user_id,auction_id,kind,event_key) values(v.seller_id,v.id,'seller_result','closed') on conflict do nothing;
    insert into public.auction_audit_events(auction_id,kind,details) values(v.id,'closed',jsonb_build_object('winning_bid_id',v.highest_bid_id,'paid',false));
  elsif v.status='scheduled' and v.starts_at<=v_now then
    update public.auctions set status='active',revision=revision+1 where id=v.id;
    insert into public.auction_audit_events(auction_id,kind) values(v.id,'activated');
  end if;
end; $$;

create function public.place_auction_bid(p_auction_id uuid,p_amount numeric,p_client_nonce uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v public.auctions; v_old public.auction_bids; v_existing public.auction_bids;
  v_product uuid; v_bid uuid; v_alias text; v_now timestamptz; v_min bigint; v_error text; v_previous_end timestamptz;
begin
  if v_user is null then raise exception 'Inicia sesión para pujar.' using errcode='42501'; end if;
  -- Rate limit all authenticated attempts, not only successful bids. Returning
  -- business rejections (instead of raising) preserves this audit transaction.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,7));
  -- An already accepted identical retry remains successful even after closing
  -- or when later attempts have consumed the rate budget. No new bid is made.
  select * into v_existing from public.auction_bids where auction_id=p_auction_id and bidder_id=v_user and client_nonce=p_client_nonce;
  if found and p_amount is not distinct from v_existing.amount::numeric then
    return jsonb_build_object('accepted',true,'bid_id',v_existing.id,'duplicate',true,'server_time',clock_timestamp(),
      'ends_at',(select ends_at from public.auctions where id=p_auction_id));
  end if;
  if (select count(*) from public.auction_bid_attempts where user_id=v_user and created_at>clock_timestamp()-interval '10 seconds')>=5
    or (select count(*) from public.auction_bid_attempts where user_id=v_user and created_at>clock_timestamp()-interval '1 minute')>=30 then
    return jsonb_build_object('accepted',false,'code','rate_limited','server_time',clock_timestamp());
  end if;
  select product_id into v_product from public.auctions where id=p_auction_id;
  if v_product is null then
    insert into public.auction_bid_attempts(user_id,outcome) values(v_user,'unavailable');
    return jsonb_build_object('accepted',false,'code','unavailable','server_time',clock_timestamp());
  end if;
  perform 1 from public.products where id=v_product for share;
  select * into v from public.auctions where id=p_auction_id for update;
  v_now:=clock_timestamp();
  select * into v_existing from public.auction_bids where auction_id=v.id and bidder_id=v_user and client_nonce=p_client_nonce;
  if found then
    if p_amount is distinct from v_existing.amount::numeric then
      insert into public.auction_bid_attempts(user_id,auction_id,outcome) values(v_user,v.id,'nonce_conflict');
      return jsonb_build_object('accepted',false,'code','nonce_conflict','server_time',v_now);
    end if;
    return jsonb_build_object('accepted',true,'bid_id',v_existing.id,'duplicate',true,'server_time',v_now,'ends_at',v.ends_at);
  end if;
  perform public.settle_auction_locked(v.id);
  select * into v from public.auctions where id=v.id;
  v_min:=case when v.bid_count=0 then v.initial_price else v.highest_amount+v.min_increment end;
  if v.seller_id=v_user then v_error:='own_listing';
  elsif p_client_nonce is null or p_amount is null or p_amount not between 1 and 1000000 or p_amount<>trunc(p_amount) then v_error:='invalid_amount';
  elsif v.status<>'active' or v.starts_at>v_now or v.ends_at<=v_now then v_error:='not_active';
  elsif public.chat_pair_blocked(v_user,v.seller_id) then v_error:='communication_blocked';
  elsif p_amount<v_min then v_error:='below_minimum';
  elsif exists(select 1 from public.auction_bids where id=v.highest_bid_id and bidder_id=v_user) then v_error:='already_leading';
  end if;
  if v_error is not null then
    insert into public.auction_bid_attempts(user_id,auction_id,outcome) values(v_user,v.id,v_error);
    insert into public.auction_audit_events(auction_id,actor_id,kind,details) values(v.id,v_user,'bid_rejected',jsonb_build_object('reason',v_error));
    return jsonb_build_object('accepted',false,'code',v_error,'minimum',v_min,'server_time',v_now,'ends_at',v.ends_at);
  end if;
  select * into v_old from public.auction_bids where id=v.highest_bid_id;
  select bidder_alias into v_alias from public.auction_bids where auction_id=v.id and bidder_id=v_user limit 1;
  if v_alias is null then
    loop
      v_alias:='Postor '||substr(replace(gen_random_uuid()::text,'-',''),1,10);
      exit when not exists(select 1 from public.auction_bids where auction_id=v.id and bidder_alias=v_alias);
    end loop;
  end if;
  insert into public.auction_bids(auction_id,bidder_id,bidder_alias,amount,sequence,client_nonce,created_at)
    values(v.id,v_user,v_alias,p_amount::bigint,v.bid_count+1,p_client_nonce,v_now) returning id into v_bid;
  insert into public.auction_bid_history(bid_id,auction_id,sequence,amount,bidder_alias,created_at)
    values(v_bid,v.id,v.bid_count+1,p_amount::bigint,v_alias,v_now);
  v_previous_end:=v.ends_at;
  -- Last minute (inclusive), add two minutes to the persisted previous deadline.
  if v.ends_at-v_now<=interval '1 minute' then v.ends_at:=v.ends_at+interval '2 minutes'; end if;
  update public.auctions set highest_bid_id=v_bid,highest_amount=p_amount::bigint,leader_alias=v_alias,bid_count=bid_count+1,
    ends_at=v.ends_at,extension_count=extension_count+case when v.ends_at>v_previous_end then 1 else 0 end,revision=revision+1 where id=v.id;
  insert into public.auction_bid_attempts(user_id,auction_id,outcome) values(v_user,v.id,'accepted');
  insert into public.auction_audit_events(auction_id,actor_id,kind,details)
    values(v.id,v_user,'bid_accepted',jsonb_build_object('bid_id',v_bid,'amount',p_amount,'ends_at',v.ends_at));
  if v.ends_at>v_previous_end then insert into public.auction_audit_events(auction_id,actor_id,kind,details)
    values(v.id,v_user,'anti_snipe',jsonb_build_object('old_end',v_previous_end,'new_end',v.ends_at)); end if;
  if v_old.bidder_id is not null and v_old.bidder_id<>v_user then
    insert into public.auction_notifications(user_id,auction_id,kind,event_key) values(v_old.bidder_id,v.id,'outbid',v_bid::text) on conflict do nothing;
  end if;
  -- Heuristic, not proof of collusion and never an automatic sanction.
  if (select count(*) from public.auction_bids where auction_id=v.id and created_at>v_now-interval '90 seconds')>=6
    and (select count(distinct bidder_id) from public.auction_bids where auction_id=v.id and created_at>v_now-interval '90 seconds')=2 then
    insert into public.auction_risk_flags(auction_id,rule,evidence)
      values(v.id,'two_accounts_rapid_alternation',jsonb_build_object('window_seconds',90,'last_bid',v_bid)) on conflict do nothing;
  end if;
  return jsonb_build_object('accepted',true,'bid_id',v_bid,'amount',p_amount,'minimum_next',p_amount+v.min_increment,'server_time',v_now,'ends_at',v.ends_at,'extended',v.ends_at>v_previous_end);
end; $$;

create function public.auction_snapshot(p_auction_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.auctions; v_product uuid;
begin
  select product_id into v_product from public.auctions where id=p_auction_id;
  if v_product is null then raise exception 'Subasta no disponible.' using errcode='22023'; end if;
  perform 1 from public.products where id=v_product for share;
  perform 1 from public.auctions where id=p_auction_id for update;
  perform public.settle_auction_locked(p_auction_id);
  select * into v from public.auctions where id=p_auction_id;
  return jsonb_build_object('auction',to_jsonb(v),'server_time',clock_timestamp(),'payments_enabled',false);
end; $$;

create function public.cancel_auction(p_auction_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v public.auctions; v_product uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
  select product_id into v_product from public.auctions where id=p_auction_id;
  perform 1 from public.products where id=v_product for share;
  select * into v from public.auctions where id=p_auction_id for update;
  if not found or v.seller_id<>auth.uid() then raise exception 'Subasta no disponible.' using errcode='42501'; end if;
  if v.bid_count>0 or v.status not in('scheduled','active') or v.ends_at<=clock_timestamp() then raise exception 'Solo puedes cancelar antes del cierre y sin pujas.' using errcode='P0001'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 500 then raise exception 'Explica el motivo de cancelación.' using errcode='22023'; end if;
  update public.auctions set status='cancelled',cancellation_reason=btrim(p_reason),closed_at=clock_timestamp(),revision=revision+1 where id=v.id;
  insert into public.auction_audit_events(auction_id,actor_id,kind,details) values(v.id,auth.uid(),'cancelled',jsonb_build_object('reason',btrim(p_reason)));
  insert into public.auction_notifications(user_id,auction_id,kind,event_key) values(v.seller_id,v.id,'cancelled','cancelled') on conflict do nothing;
end; $$;

create function public.guard_auction_exchange() returns trigger
language plpgsql security definer set search_path='' as $$
declare v public.auctions;
begin
  select * into v from public.auctions where product_id=new.product_id for share;
  if not found then return new; end if;
  if v.status<>'ended_winner' or new.seller_id<>v.seller_id
    or not exists(select 1 from public.auction_results r where r.auction_id=v.id and r.winner_id=new.buyer_id) then
    raise exception 'Solo el ganador provisional puede coordinar este artículo después del cierre.' using errcode='42501';
  end if;
  return new;
end; $$;
create trigger auction_exchange_insert before insert on public.exchange_requests for each row execute function public.guard_auction_exchange();

create function public.coordinate_auction(p_auction_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v public.auctions; r public.auction_results; v_product uuid; v_exchange uuid; v_title text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
  select product_id into v_product from public.auctions where id=p_auction_id;
  select title into v_title from public.products where id=v_product for share;
  select * into v from public.auctions where id=p_auction_id for update;
  select * into r from public.auction_results where auction_id=p_auction_id;
  if v.id is null or r.auction_id is null or auth.uid() not in(v.seller_id,r.winner_id) then raise exception 'Resultado no disponible.' using errcode='42501'; end if;
  if r.exchange_id is not null then return r.exchange_id; end if;
  if public.chat_pair_blocked(v.seller_id,r.winner_id) then raise exception 'La coordinación no está disponible debido a un bloqueo.' using errcode='P0001'; end if;
  insert into public.exchange_requests(product_id,product_title,buyer_id,seller_id)
    values(v.product_id,v_title,r.winner_id,v.seller_id)
    on conflict(product_id,buyer_id) where status in('pending','accepted') do nothing returning id into v_exchange;
  if v_exchange is null then select id into v_exchange from public.exchange_requests where product_id=v.product_id and buyer_id=r.winner_id and status in('pending','accepted'); end if;
  update public.auction_results set exchange_id=v_exchange where auction_id=v.id;
  update public.auctions set formalization_status='coordination',revision=revision+1 where id=v.id;
  insert into public.auction_audit_events(auction_id,actor_id,kind,details) values(v.id,auth.uid(),'coordination_opened',jsonb_build_object('exchange_id',v_exchange,'paid',false));
  return v_exchange;
end; $$;

create function public.read_auction_notification(p_notification_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
  update public.auction_notifications set read_at=coalesce(read_at,clock_timestamp()) where id=p_notification_id and user_id=auth.uid();
end; $$;

create function public.advance_auction_clock() returns integer
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_product uuid; v_locked uuid; v_count integer:=0;
begin
  -- No browser permission. Cron settles bounded batches without browser clocks.
  for v_id,v_product in select id,product_id from public.auctions
    where status in('scheduled','active') and (ends_at<=clock_timestamp() or (status='scheduled' and starts_at<=clock_timestamp()))
    order by ends_at limit 200 loop
    perform 1 from public.products where id=v_product for share skip locked;
    if not found then continue; end if;
    select id into v_locked from public.auctions where id=v_id for update skip locked;
    if not found then continue; end if;
    perform public.settle_auction_locked(v_id); v_count:=v_count+1;
  end loop;
  return v_count;
end; $$;
create function public.auctions_health() returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('version',5,'server_time',clock_timestamp(),'payments_enabled',false)
$$;

revoke all on function public.protect_auction_product(),public.guard_auction_product_insert(),public.create_auction(uuid,numeric,numeric,integer,text,integer,text[]),
  public.settle_auction_locked(uuid),public.place_auction_bid(uuid,numeric,uuid),public.auction_snapshot(uuid),public.cancel_auction(uuid,text),
  public.guard_auction_exchange(),public.coordinate_auction(uuid),public.read_auction_notification(uuid),public.advance_auction_clock(),public.auctions_health() from public,anon,authenticated;
grant execute on function public.create_auction(uuid,numeric,numeric,integer,text,integer,text[]),public.place_auction_bid(uuid,numeric,uuid),
  public.cancel_auction(uuid,text),public.coordinate_auction(uuid),public.read_auction_notification(uuid) to authenticated;
grant execute on function public.auction_snapshot(uuid),public.auctions_health() to anon,authenticated;
-- Internal settlement/clock/trigger functions remain admin-only. No service key in client.

do $$
declare v_table text;
begin
  foreach v_table in array array['auctions','auction_bid_history','auction_notifications'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=v_table) then
      execute format('alter publication supabase_realtime add table public.%I',v_table);
    end if;
  end loop;
  -- Private bids, attempts, audit, reports and user_blocks are NOT added.
  perform cron.schedule('pendejaditas-auction-clock','* * * * *','select public.advance_auction_clock();');
end; $$;
notify pgrst,'reload schema';
commit;
-- END Pendejaditas auction engine 202610240005
