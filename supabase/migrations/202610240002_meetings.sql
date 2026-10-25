-- NEW stage only. Do not run the previous marketplace migration again.
-- Adds new objects; does not delete or replace existing tables, rows or policies.
begin;
create table public.meeting_places (
  id text primary key, name text not null, address text not null, zone text not null,
  latitude double precision not null check(latitude between 20 and 21),
  longitude double precision not null check(longitude between -101 and -100),
  source_url text not null, coordinates_source_url text not null,
  verified_on date not null, active boolean not null default true
);
insert into public.meeting_places values
('antea','Antea Lifestyle Center','Carretera San Luis Potosí–Querétaro 12401, El Salitre, C.P. 76127, Santiago de Querétaro, Querétaro, México','El Salitre',20.6742,-100.4362,'https://antea.mx/contactanos/','https://en.wikipedia.org/wiki/Antea_LifeStyle_Center','2026-10-24',true),
('puerta-victoria','Plaza Puerta La Victoria','Av. Constituyentes 40, Col. Villas del Sol, Querétaro, Querétaro, México','Villas del Sol',20.585053332988743,-100.38230644651445,'https://puertalavictoria.mx/contacto/','https://puertalavictoria.mx/contacto/','2026-10-24',true);

create table public.exchange_requests (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  product_title text not null,
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  status text not null default 'pending' check(status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(buyer_id <> seller_id)
);
create unique index exchange_active_pair on public.exchange_requests(product_id,buyer_id) where status in ('pending','accepted');
create index exchange_buyer_idx on public.exchange_requests(buyer_id);
create index exchange_seller_idx on public.exchange_requests(seller_id);

create table public.exchange_appointments (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null unique references public.exchange_requests(id),
  place_id text not null references public.meeting_places(id),
  starts_at timestamptz not null,
  proposed_by uuid not null references public.profiles(id),
  status text not null check(status in ('proposed','confirmed','declined','cancelled')),
  revision integer not null default 1 check(revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.exchange_appointments(id),
  exchange_id uuid not null references public.exchange_requests(id),
  actor_id uuid not null references public.profiles(id),
  action text not null check(action in ('propose','reschedule','accept','reject','cancel')),
  revision integer not null, place_id text not null references public.meeting_places(id),
  starts_at timestamptz not null, created_at timestamptz not null default now(),
  unique(appointment_id,revision)
);
create index appointment_exchange_idx on public.appointment_events(exchange_id,created_at);
alter table public.meeting_places enable row level security;
alter table public.exchange_requests enable row level security;
alter table public.exchange_appointments enable row level security;
alter table public.appointment_events enable row level security;
revoke all on public.meeting_places, public.exchange_requests, public.exchange_appointments, public.appointment_events from public, anon, authenticated;
grant select on public.meeting_places to anon, authenticated;
grant select on public.exchange_requests, public.exchange_appointments, public.appointment_events to authenticated;
create policy places_public_read on public.meeting_places for select to anon, authenticated using(active);
create policy exchanges_participant_read on public.exchange_requests for select to authenticated
  using((select auth.uid()) in (buyer_id,seller_id));
create policy appointments_participant_read on public.exchange_appointments for select to authenticated
  using(exists(select 1 from public.exchange_requests e where e.id=exchange_id and (select auth.uid()) in(e.buyer_id,e.seller_id)));
create policy appointment_events_participant_read on public.appointment_events for select to authenticated
  using(exists(select 1 from public.exchange_requests e where e.id=exchange_id and (select auth.uid()) in(e.buyer_id,e.seller_id)));
-- No client INSERT/UPDATE/DELETE grants. Mutations must pass the RPC rules below.

create function public.request_exchange(p_product_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_product public.products; v_id uuid;
begin
  if v_user is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
  select * into v_product from public.products where id=p_product_id for share;
  if not found or v_product.owner_id=v_user then raise exception 'Selecciona un artículo de otra cuenta.' using errcode='22023'; end if;
  insert into public.exchange_requests(product_id,product_title,buyer_id,seller_id)
    values(v_product.id,v_product.title,v_user,v_product.owner_id)
    on conflict(product_id,buyer_id) where status in ('pending','accepted') do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.exchange_requests where product_id=p_product_id and buyer_id=v_user and status in('pending','accepted'); end if;
  return v_id;
end; $$;

create function public.respond_exchange(p_exchange_id uuid,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_exchange public.exchange_requests;
begin
  select * into v_exchange from public.exchange_requests where id=p_exchange_id for update;
  if not found or v_user is null or v_user not in(v_exchange.buyer_id,v_exchange.seller_id) then raise exception 'Operación no disponible.' using errcode='42501'; end if;
  if v_exchange.status<>'pending' then raise exception 'La solicitud ya cambió. Actualiza.' using errcode='40001'; end if;
  if (p_action in('accept','reject') and v_user=v_exchange.seller_id) then
    update public.exchange_requests set status=case when p_action='accept' then 'accepted' else 'rejected' end,updated_at=clock_timestamp() where id=p_exchange_id;
  elsif p_action='cancel' and v_user=v_exchange.buyer_id then
    update public.exchange_requests set status='cancelled',updated_at=clock_timestamp() where id=p_exchange_id;
  else raise exception 'Acción no permitida.' using errcode='42501'; end if;
end; $$;

create function public.change_appointment(p_exchange_id uuid,p_action text,p_expected_revision integer default 0,p_place_id text default null,p_local_time timestamp without time zone default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_exchange public.exchange_requests; v_appointment public.exchange_appointments;
  v_exists boolean; v_starts timestamptz; v_id uuid; v_action text;
begin
  -- All changes for one operation serialize on the same row, including first proposals.
  select * into v_exchange from public.exchange_requests where id=p_exchange_id for update;
  if not found or v_user is null or v_user not in(v_exchange.buyer_id,v_exchange.seller_id) then raise exception 'Operación no disponible.' using errcode='42501'; end if;
  if v_exchange.status<>'accepted' then raise exception 'Ambas partes deben aceptar el intercambio primero.' using errcode='22023'; end if;
  select * into v_appointment from public.exchange_appointments where exchange_id=p_exchange_id for update;
  v_exists:=found;
  if coalesce(p_expected_revision,-1) <> (case when v_exists then v_appointment.revision else 0 end) then
    raise exception 'La cita cambió. Actualiza antes de responder.' using errcode='40001';
  end if;
  if v_exists and (v_appointment.status='cancelled' or v_appointment.starts_at<=now()) then raise exception 'Esta cita ya pertenece al historial.' using errcode='22023'; end if;
  if p_action='propose' then
    if p_local_time is null or not exists(select 1 from public.meeting_places where id=p_place_id and active) then raise exception 'Selecciona un lugar y una fecha válidos.' using errcode='22023'; end if;
    v_starts:=p_local_time at time zone 'America/Mexico_City';
    if v_starts<now()+interval '1 hour' or v_starts>now()+interval '90 days' then raise exception 'Propón entre una hora y 90 días de anticipación.' using errcode='22023'; end if;
    if v_exists then
      update public.exchange_appointments set place_id=p_place_id,starts_at=v_starts,proposed_by=v_user,status='proposed',revision=revision+1,updated_at=clock_timestamp() where id=v_appointment.id returning id into v_id;
      v_action:='reschedule';
    else
      insert into public.exchange_appointments(exchange_id,place_id,starts_at,proposed_by,status) values(p_exchange_id,p_place_id,v_starts,v_user,'proposed') returning id into v_id;
      v_action:='propose';
    end if;
  elsif p_action in('accept','reject','cancel') and v_exists then
    if p_action in('accept','reject') and (v_appointment.status<>'proposed' or v_appointment.proposed_by=v_user) then raise exception 'Solo la otra persona puede responder a la propuesta pendiente.' using errcode='42501'; end if;
    update public.exchange_appointments set status=case p_action when 'accept' then 'confirmed' when 'reject' then 'declined' else 'cancelled' end,revision=revision+1,updated_at=clock_timestamp() where id=v_appointment.id returning id into v_id;
    if p_action='cancel' then update public.exchange_requests set status='cancelled',updated_at=clock_timestamp() where id=p_exchange_id; end if;
    v_action:=p_action;
  else raise exception 'Acción no válida.' using errcode='22023'; end if;
  insert into public.appointment_events(appointment_id,exchange_id,actor_id,action,revision,place_id,starts_at)
    select id,exchange_id,v_user,v_action,revision,place_id,starts_at from public.exchange_appointments where id=v_id;
  return v_id;
end; $$;

create function public.meetings_health() returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('version',3,'server_time',now())
$$;
revoke all on function public.request_exchange(uuid), public.respond_exchange(uuid,text), public.change_appointment(uuid,text,integer,text,timestamp without time zone), public.meetings_health() from public,anon,authenticated;
grant execute on function public.request_exchange(uuid), public.respond_exchange(uuid,text), public.change_appointment(uuid,text,integer,text,timestamp without time zone) to authenticated;
grant execute on function public.meetings_health() to anon,authenticated;
commit;
-- END Pendejaditas meetings migration 202610240002
