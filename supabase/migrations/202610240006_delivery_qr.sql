-- PREPARED ONLY. Requires the owner's authorization before remote execution.
-- No payments, monetary release, QR seed data, extension installation or cron jobs.
begin;
do $$
begin
  if to_regclass('public.exchange_requests') is null or to_regclass('public.exchange_appointments') is null
    or to_regclass('public.auction_results') is null or to_regprocedure('public.chat_pair_blocked(uuid,uuid)') is null then
    raise exception 'Faltan dependencias previas. No repitas migraciones: revisa la instalación.';
  end if;
  if to_regprocedure('pg_catalog.sha256(bytea)') is null then raise exception 'Falta SHA-256 nativo de PostgreSQL.'; end if;
  if not exists(select 1 from pg_publication where pubname='supabase_realtime') then raise exception 'Falta supabase_realtime.'; end if;
end; $$;

create table public.delivery_operations (
 id uuid primary key default gen_random_uuid(),
 exchange_id uuid not null references public.exchange_requests(id),
 appointment_id uuid not null references public.exchange_appointments(id),
 appointment_revision integer not null check(appointment_revision>0),
 product_id uuid not null references public.products(id),
 product_title text not null, agreed_reference_amount numeric(12,0) not null,
 source text not null check(source in('fixed','auction')),
 buyer_id uuid not null references public.profiles(id), seller_id uuid not null references public.profiles(id),
 status text not null default 'ready' check(status in('ready','awaiting_confirmation','recorded','cancelled','review')),
 revision integer not null default 1 check(revision>0),
 seller_confirmed_at timestamptz, confirm_by timestamptz, recorded_at timestamptz,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(exchange_id,appointment_revision),check(buyer_id<>seller_id),
 check((status<>'recorded') or (recorded_at is not null and seller_confirmed_at is not null))
);
-- One article cannot have two concurrent or recorded delivery operations.
create unique index delivery_product_slot on public.delivery_operations(product_id) where status<>'cancelled';
create index delivery_buyer_idx on public.delivery_operations(buyer_id,created_at);
create index delivery_seller_idx on public.delivery_operations(seller_id,created_at);
create table public.delivery_qr_tokens (
 id uuid primary key default gen_random_uuid(), operation_id uuid not null references public.delivery_operations(id),
 token_hash bytea not null unique check(octet_length(token_hash)=32),
 operation_revision integer not null, expires_at timestamptz not null,
 consumed_at timestamptz, revoked_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),check(expires_at>created_at)
);
create unique index delivery_one_current_qr on public.delivery_qr_tokens(operation_id) where consumed_at is null and revoked_at is null;
create table public.delivery_receipts (
 operation_id uuid not null references public.delivery_operations(id),user_id uuid not null references public.profiles(id),
 nonce uuid not null, action text not null, request_hash bytea not null, response jsonb not null,
 created_at timestamptz not null default clock_timestamp(), primary key(operation_id,user_id,nonce)
);
create table public.delivery_events (
 id bigint generated always as identity primary key,operation_id uuid not null references public.delivery_operations(id),
 actor_id uuid references public.profiles(id),kind text not null,
 created_at timestamptz not null default clock_timestamp()
);
create index delivery_events_operation_idx on public.delivery_events(operation_id,id);
create table public.delivery_attempts (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),action text not null,
 created_at timestamptz not null default clock_timestamp()
);
create index delivery_attempts_user_idx on public.delivery_attempts(user_id,created_at);
create table public.delivery_incidents (
 id uuid primary key default gen_random_uuid(),operation_id uuid not null references public.delivery_operations(id),
 reporter_id uuid not null references public.profiles(id),
 reason text not null check(reason in('disagreement','item_issue','fraud','discomfort','threat','other')),
 details text not null check(char_length(details)<=1500),paused boolean not null,
 review_status text not null default 'pending' check(review_status in('pending','reviewing','resolved')),
 created_at timestamptz not null default clock_timestamp()
);
create table public.delivery_incident_reviews (
 id uuid primary key default gen_random_uuid(),incident_id uuid not null references public.delivery_incidents(id),
 decision text not null check(decision in('acknowledge','close_report','resume_unrecorded','cancel_unrecorded')),
 note text not null check(char_length(btrim(note)) between 10 and 1500),
 reviewer_db_role text not null default session_user,created_at timestamptz not null default clock_timestamp()
);
alter table public.delivery_operations enable row level security;
alter table public.delivery_qr_tokens enable row level security;
alter table public.delivery_receipts enable row level security;
alter table public.delivery_events enable row level security;
alter table public.delivery_attempts enable row level security;
alter table public.delivery_incidents enable row level security;
alter table public.delivery_incident_reviews enable row level security;
revoke all on public.delivery_operations,public.delivery_qr_tokens,public.delivery_receipts,public.delivery_events,public.delivery_attempts,public.delivery_incidents,public.delivery_incident_reviews from public,anon,authenticated;
grant select on public.delivery_operations,public.delivery_events,public.delivery_incidents to authenticated;
create policy delivery_participants_read on public.delivery_operations for select to authenticated using((select auth.uid()) in(buyer_id,seller_id));
create policy delivery_events_participants_read on public.delivery_events for select to authenticated using(exists(select 1 from public.delivery_operations d where d.id=operation_id and (select auth.uid()) in(d.buyer_id,d.seller_id)));
create policy delivery_incidents_reporter_read on public.delivery_incidents for select to authenticated using(reporter_id=(select auth.uid()));
-- Token hashes, receipts and attempt logs have no frontend read/write permissions.

create function public.delivery_attempt(p_action text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,12));
 if (select count(*) from public.delivery_attempts where user_id=auth.uid() and created_at>clock_timestamp()-interval '1 minute')>=20
   or (p_action='issue' and (select count(*) from public.delivery_attempts where user_id=auth.uid() and action='issue' and created_at>clock_timestamp()-interval '1 minute')>=3) then return null; end if;
 insert into public.delivery_attempts(user_id,action) values(auth.uid(),p_action) returning id into v_id; return v_id;
end; $$;

-- All operation mutations use product -> exchange -> appointment -> operation.
-- Appointment APIs already lock exchange -> appointment, so their invalidation
-- trigger can safely lock the operation without introducing an inverse order.
create function public.delivery_lock(p_operation_id uuid) returns public.delivery_operations
language plpgsql security definer set search_path='' as $$
declare v public.delivery_operations;
begin
 select * into v from public.delivery_operations where id=p_operation_id;
 if not found or auth.uid() is null or auth.uid() not in(v.buyer_id,v.seller_id) then return null; end if;
 perform 1 from public.products where id=v.product_id for share;
 perform 1 from public.exchange_requests where id=v.exchange_id for update;
 perform 1 from public.exchange_appointments where id=v.appointment_id for update;
 select * into v from public.delivery_operations where id=p_operation_id for update;
 return v;
end; $$;

create function public.delivery_context_valid(p_operation_id uuid,p_check_window boolean default true) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.delivery_operations d
  join public.exchange_requests e on e.id=d.exchange_id
  join public.exchange_appointments a on a.id=d.appointment_id and a.exchange_id=e.id
  join public.products p on p.id=d.product_id
  where d.id=p_operation_id and e.status='accepted' and a.status='confirmed' and a.revision=d.appointment_revision
    and e.buyer_id=d.buyer_id and e.seller_id=d.seller_id and e.product_id=d.product_id and p.owner_id=d.seller_id
    and not public.chat_pair_blocked(d.buyer_id,d.seller_id)
    and (not p_check_window or clock_timestamp() between a.starts_at-interval '30 minutes' and a.starts_at+interval '24 hours')
    and ((d.source='fixed' and p.sale_type='fixed') or (d.source='auction' and exists(
      select 1 from public.auctions au join public.auction_results r on r.auction_id=au.id
      where au.product_id=d.product_id and au.status='ended_winner' and r.winner_id=d.buyer_id and au.seller_id=d.seller_id and r.exchange_id=d.exchange_id))))
$$;

-- Idempotency receipts contain no raw token. A duplicate is an acknowledgment
-- of the original action, not a new scan and not proof of current operation state.
create function public.delivery_previous(p_operation_id uuid,p_nonce uuid,p_action text,p_hash bytea) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.delivery_receipts;
begin
 select * into r from public.delivery_receipts where operation_id=p_operation_id and user_id=auth.uid() and nonce=p_nonce;
 if not found then return null; end if;
 if r.action<>p_action or r.request_hash<>p_hash then return jsonb_build_object('ok',false,'code','nonce_conflict'); end if;
 return r.response||jsonb_build_object('duplicate',true);
end; $$;

create function public.create_delivery(p_exchange_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.exchange_requests;a public.exchange_appointments;p public.products;d public.delivery_operations;v_amount numeric;v_source text;
begin
 if public.delivery_attempt('create') is null then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
 select * into e from public.exchange_requests where id=p_exchange_id;
 if not found or auth.uid() not in(e.buyer_id,e.seller_id) then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 select * into p from public.products where id=e.product_id for share;
 select * into e from public.exchange_requests where id=p_exchange_id for update;
 select * into a from public.exchange_appointments where exchange_id=e.id for update;
 if p.id is null or p.id is distinct from e.product_id or a.id is null or e.status<>'accepted' or a.status<>'confirmed' or p.owner_id<>e.seller_id
   or public.chat_pair_blocked(e.buyer_id,e.seller_id) then return jsonb_build_object('ok',false,'code','context_changed'); end if;
 select * into d from public.delivery_operations where exchange_id=e.id and appointment_revision=a.revision;
 if found then return jsonb_build_object('ok',true,'operation_id',d.id,'status',d.status,'duplicate',true); end if;
 v_amount:=p.price;v_source:=p.sale_type;
 if v_source='auction' then
  select r.amount into v_amount from public.auctions au join public.auction_results r on r.auction_id=au.id
   where au.product_id=p.id and au.status='ended_winner' and au.seller_id=e.seller_id and r.winner_id=e.buyer_id and r.exchange_id=e.id;
  if not found then return jsonb_build_object('ok',false,'code','winner_required'); end if;
 elsif v_source<>'fixed' then return jsonb_build_object('ok',false,'code','unsupported_sale'); end if;
 begin
  insert into public.delivery_operations(exchange_id,appointment_id,appointment_revision,product_id,product_title,agreed_reference_amount,source,buyer_id,seller_id)
   values(e.id,a.id,a.revision,p.id,p.title,v_amount,v_source,e.buyer_id,e.seller_id) returning * into d;
 exception when unique_violation then return jsonb_build_object('ok',false,'code','product_unavailable'); end;
 insert into public.delivery_events(operation_id,actor_id,kind) values(d.id,auth.uid(),'created');
 return jsonb_build_object('ok',true,'operation_id',d.id,'status',d.status,'payments_enabled',false);
end; $$;

create function public.issue_delivery_qr(p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.delivery_operations;v_secret text;v_now timestamptz;v_token uuid;
begin
 if public.delivery_attempt('issue') is null then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
 d:=public.delivery_lock(p_operation_id);
 if d.id is null then return jsonb_build_object('ok',false,'code','unavailable'); end if;v_now:=clock_timestamp();
 if auth.uid()<>d.buyer_id then return jsonb_build_object('ok',false,'code','buyer_required'); end if;
 if not public.delivery_context_valid(d.id) then return jsonb_build_object('ok',false,'code','context_or_time'); end if;
 if d.status='awaiting_confirmation' and d.confirm_by<=v_now then
  update public.delivery_operations set status='ready',seller_confirmed_at=null,confirm_by=null where id=d.id;
  d.status:='ready';
 end if;
 if d.status<>'ready' then return jsonb_build_object('ok',false,'code','not_ready'); end if;
 update public.delivery_qr_tokens set revoked_at=v_now where operation_id=d.id and consumed_at is null and revoked_at is null;
 -- Two independent random UUID v4s: 244 random bits. Never use time-based UUIDs.
 v_secret:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 update public.delivery_operations set revision=revision+1,updated_at=v_now where id=d.id returning * into d;
 insert into public.delivery_qr_tokens(operation_id,token_hash,operation_revision,expires_at)
  values(d.id,sha256(convert_to(v_secret,'UTF8')),d.revision,v_now+interval '90 seconds') returning id into v_token;
 insert into public.delivery_events(operation_id,actor_id,kind) values(d.id,auth.uid(),'qr_issued');
 return jsonb_build_object('ok',true,'operation_id',d.id,'revision',d.revision,'token_id',v_token,
  'payload','pjd:delivery:v1:'||d.id::text||':'||v_secret,'expires_at',v_now+interval '90 seconds','server_time',v_now);
end; $$;

create function public.redeem_delivery_qr(p_operation_id uuid,p_token text,p_nonce uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.delivery_operations;t public.delivery_qr_tokens;v_hash bytea;v_previous jsonb;v_response jsonb;v_now timestamptz;
begin
 if p_nonce is null or p_token is null or p_token !~ '^[0-9a-f]{64}$' then
  if public.delivery_attempt('redeem') is null then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
  return jsonb_build_object('ok',false,'code','invalid_qr');
 end if;
 v_hash:=sha256(convert_to(p_token,'UTF8'));v_previous:=public.delivery_previous(p_operation_id,p_nonce,'redeem',v_hash);
 if v_previous is not null then return v_previous; end if;
 if public.delivery_attempt('redeem') is null then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
 v_previous:=public.delivery_previous(p_operation_id,p_nonce,'redeem',v_hash);if v_previous is not null then return v_previous; end if;
 d:=public.delivery_lock(p_operation_id);
 if d.id is null then return jsonb_build_object('ok',false,'code','unavailable'); end if;v_now:=clock_timestamp();
 if auth.uid()<>d.seller_id then return jsonb_build_object('ok',false,'code','seller_required'); end if;
 if not public.delivery_context_valid(d.id) then return jsonb_build_object('ok',false,'code','context_or_time'); end if;
 if d.status<>'ready' then return jsonb_build_object('ok',false,'code','not_ready'); end if;
 select * into t from public.delivery_qr_tokens where operation_id=d.id and token_hash=v_hash for update;
 if not found or t.revoked_at is not null or t.consumed_at is not null or t.expires_at<=v_now or t.operation_revision<>d.revision then
  return jsonb_build_object('ok',false,'code','invalid_or_expired_qr');
 end if;
 update public.delivery_qr_tokens set consumed_at=v_now where id=t.id;
 update public.delivery_operations set status='awaiting_confirmation',seller_confirmed_at=v_now,confirm_by=v_now+interval '5 minutes',revision=revision+1,updated_at=v_now where id=d.id returning * into d;
 insert into public.delivery_events(operation_id,actor_id,kind) values(d.id,auth.uid(),'seller_confirmed');
 v_response:=jsonb_build_object('ok',true,'operation_id',d.id,'status',d.status,'revision',d.revision,'confirm_by',d.confirm_by,'payments_enabled',false);
 insert into public.delivery_receipts(operation_id,user_id,nonce,action,request_hash,response) values(d.id,auth.uid(),p_nonce,'redeem',v_hash,v_response);
 return v_response;
end; $$;

create function public.confirm_delivery(p_operation_id uuid,p_expected_revision integer,p_nonce uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.delivery_operations;v_hash bytea;v_previous jsonb;v_response jsonb;v_now timestamptz;
begin
 v_hash:=sha256(convert_to(coalesce(p_expected_revision::text,''),'UTF8'));
 v_previous:=public.delivery_previous(p_operation_id,p_nonce,'confirm',v_hash);if v_previous is not null then return v_previous; end if;
 if public.delivery_attempt('confirm') is null then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
 v_previous:=public.delivery_previous(p_operation_id,p_nonce,'confirm',v_hash);if v_previous is not null then return v_previous; end if;
 d:=public.delivery_lock(p_operation_id);
 if d.id is null then return jsonb_build_object('ok',false,'code','unavailable'); end if;v_now:=clock_timestamp();
 if auth.uid()<>d.buyer_id then return jsonb_build_object('ok',false,'code','buyer_required'); end if;
 if p_nonce is null or p_expected_revision is distinct from d.revision then return jsonb_build_object('ok',false,'code','stale_revision'); end if;
 if not public.delivery_context_valid(d.id) then return jsonb_build_object('ok',false,'code','context_or_time'); end if;
 if d.status<>'awaiting_confirmation' or d.seller_confirmed_at is null or d.confirm_by<=v_now then return jsonb_build_object('ok',false,'code','confirmation_expired_or_unavailable'); end if;
 update public.delivery_operations set status='recorded',recorded_at=v_now,revision=revision+1,updated_at=v_now where id=d.id returning * into d;
 insert into public.delivery_events(operation_id,actor_id,kind) values(d.id,auth.uid(),'buyer_confirmed_delivery');
 v_response:=jsonb_build_object('ok',true,'operation_id',d.id,'status',d.status,'revision',d.revision,'recorded_at',v_now,'payments_enabled',false);
 insert into public.delivery_receipts(operation_id,user_id,nonce,action,request_hash,response) values(d.id,auth.uid(),p_nonce,'confirm',v_hash,v_response);
 return v_response;
end; $$;

create function public.cancel_delivery(p_operation_id uuid,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.delivery_operations;
begin
 if public.delivery_attempt('cancel') is null then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
 d:=public.delivery_lock(p_operation_id);
 if d.id is null then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 if d.status='cancelled' then return jsonb_build_object('ok',true,'operation_id',d.id,'status','cancelled','duplicate',true); end if;
 if p_expected_revision is distinct from d.revision then return jsonb_build_object('ok',false,'code','stale_revision'); end if;
 if d.status not in('ready','awaiting_confirmation') then return jsonb_build_object('ok',false,'code','report_required'); end if;
 update public.delivery_qr_tokens set revoked_at=clock_timestamp() where operation_id=d.id and revoked_at is null;
 update public.delivery_operations set status='cancelled',revision=revision+1,updated_at=clock_timestamp() where id=d.id;
 insert into public.delivery_events(operation_id,actor_id,kind) values(d.id,auth.uid(),'cancelled');
 return jsonb_build_object('ok',true,'operation_id',d.id,'status','cancelled','payments_enabled',false);
end; $$;

create function public.report_delivery_incident(p_operation_id uuid,p_reason text,p_details text,p_pause boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.delivery_operations;v_id uuid;
begin
 if public.delivery_attempt('report') is null then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
 d:=public.delivery_lock(p_operation_id);
 if d.id is null then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 if p_reason is null or p_reason not in('disagreement','item_issue','fraud','discomfort','threat','other') or p_details is null or char_length(p_details)>1500 or p_pause is null then return jsonb_build_object('ok',false,'code','invalid_report'); end if;
 if (select count(*) from public.delivery_incidents where reporter_id=auth.uid() and created_at>clock_timestamp()-interval '1 day')>=5 then return jsonb_build_object('ok',false,'code','report_limit'); end if;
 insert into public.delivery_incidents(operation_id,reporter_id,reason,details,paused) values(d.id,auth.uid(),p_reason,p_details,p_pause) returning id into v_id;
 if p_pause and d.status<>'cancelled' then
  update public.delivery_qr_tokens set revoked_at=clock_timestamp() where operation_id=d.id and revoked_at is null;
  update public.delivery_operations set status='review',revision=revision+1,updated_at=clock_timestamp() where id=d.id;
  -- Shared status necessarily reveals a pause; never publish reporter or details.
  insert into public.delivery_events(operation_id,kind) values(d.id,'paused_for_review');
 end if;
 -- A discreet report alone emits no shared event or status change.
 return jsonb_build_object('ok',true,'incident_id',v_id,'review_status','pending','paused',p_pause,'payments_enabled',false);
end; $$;

create function public.delivery_context_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_exchange uuid;d public.delivery_operations;
begin
 if tg_table_name='exchange_requests' then
  if new.status=old.status and new.product_id is not distinct from old.product_id and new.buyer_id=old.buyer_id and new.seller_id=old.seller_id then return new; end if;
  v_exchange:=old.id;
 else
  if new.status=old.status and new.revision=old.revision and new.starts_at=old.starts_at and new.place_id=old.place_id then return new; end if;
  v_exchange:=old.exchange_id;
 end if;
 for d in select * from public.delivery_operations where exchange_id=v_exchange and status<>'cancelled' order by id for update loop
  if d.recorded_at is not null or d.status='review' then raise exception 'La entrega registrada o en revisión conserva el acuerdo. Usa el reporte de incidentes.' using errcode='P0001'; end if;
  update public.delivery_qr_tokens set revoked_at=clock_timestamp() where operation_id=d.id and revoked_at is null;
  update public.delivery_operations set status='cancelled',revision=revision+1,updated_at=clock_timestamp() where id=d.id;
  insert into public.delivery_events(operation_id,actor_id,kind) values(d.id,auth.uid(),'context_changed');
 end loop;
 return new;
end; $$;
create trigger delivery_exchange_changed before update on public.exchange_requests for each row execute function public.delivery_context_changed();
create trigger delivery_appointment_changed before update on public.exchange_appointments for each row execute function public.delivery_context_changed();
create function public.delivery_product_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.delivery_operations where product_id=old.id and (status<>'cancelled' or tg_op='DELETE')) then
  if tg_op='DELETE' then raise exception 'La entrega conserva su artículo e historial.' using errcode='P0001'; end if;
  if (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then raise exception 'El artículo vinculado a una entrega activa o registrada no se puede modificar.' using errcode='P0001'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;return new;
end; $$;
create trigger delivery_product_preserve before update or delete on public.products for each row execute function public.delivery_product_guard();

-- Human review from SQL Editor by the database owner only. No frontend or
-- service_role execution grant. Does not reverse a recorded delivery or money.
create function public.review_delivery_incident(p_incident_id uuid,p_decision text,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.delivery_incidents;d public.delivery_operations;
begin
 if p_decision is null or p_decision not in('acknowledge','close_report','resume_unrecorded','cancel_unrecorded')
   or p_note is null or char_length(btrim(p_note)) not between 10 and 1500 then raise exception 'Revisa la decisión y su justificación.' using errcode='22023'; end if;
 select * into i from public.delivery_incidents where id=p_incident_id;
 if not found then raise exception 'Incidente no disponible.' using errcode='22023'; end if;
 select * into d from public.delivery_operations where id=i.operation_id;
 perform 1 from public.products where id=d.product_id for share;
 perform 1 from public.exchange_requests where id=d.exchange_id for update;
 perform 1 from public.exchange_appointments where id=d.appointment_id for update;
 select * into d from public.delivery_operations where id=i.operation_id for update;
 select * into i from public.delivery_incidents where id=p_incident_id for update;
 if p_decision in('resume_unrecorded','cancel_unrecorded') then
  if d.recorded_at is not null or d.status<>'review' then raise exception 'Solo una entrega pendiente y pausada admite esta decisión.' using errcode='P0001'; end if;
  if p_decision='resume_unrecorded' and not public.delivery_context_valid(d.id,false) then raise exception 'Resuelve el acuerdo o bloqueo antes de reanudar.' using errcode='P0001'; end if;
  if exists(select 1 from public.delivery_incidents where operation_id=d.id and paused and review_status<>'resolved' and id<>i.id) then raise exception 'Hay otros incidentes pendientes de revisión.' using errcode='P0001'; end if;
  update public.delivery_qr_tokens set revoked_at=clock_timestamp() where operation_id=d.id and revoked_at is null;
  update public.delivery_operations set status=case when p_decision='resume_unrecorded' then 'ready' else 'cancelled' end,
    seller_confirmed_at=null,confirm_by=null,revision=revision+1,updated_at=clock_timestamp() where id=d.id;
  insert into public.delivery_events(operation_id,kind) values(d.id,'review_decision');
 elsif p_decision='close_report' and d.recorded_at is not null and d.status='review'
   and not exists(select 1 from public.delivery_incidents where operation_id=d.id and paused and review_status<>'resolved' and id<>i.id) then
  update public.delivery_operations set status='recorded',revision=revision+1,updated_at=clock_timestamp() where id=d.id;
  insert into public.delivery_events(operation_id,kind) values(d.id,'review_completed');
 end if;
 update public.delivery_incidents set review_status=case when p_decision='acknowledge' then 'reviewing' else 'resolved' end where id=i.id;
 insert into public.delivery_incident_reviews(incident_id,decision,note) values(i.id,p_decision,btrim(p_note));
 return jsonb_build_object('ok',true,'incident_id',i.id,'payments_enabled',false);
end; $$;
revoke all on function public.review_delivery_incident(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.review_delivery_incident(uuid,text,text) to postgres;

create function public.delivery_health() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('version',6,'server_time',clock_timestamp(),'payments_enabled',false)
$$;
revoke all on function public.delivery_attempt(text),public.delivery_lock(uuid),public.delivery_context_valid(uuid,boolean),public.delivery_previous(uuid,uuid,text,bytea),
 public.create_delivery(uuid),public.issue_delivery_qr(uuid),public.redeem_delivery_qr(uuid,text,uuid),public.confirm_delivery(uuid,integer,uuid),public.cancel_delivery(uuid,integer),
 public.report_delivery_incident(uuid,text,text,boolean),public.delivery_context_changed(),public.delivery_product_guard(),public.delivery_health() from public,anon,authenticated;
grant execute on function public.create_delivery(uuid),public.issue_delivery_qr(uuid),public.redeem_delivery_qr(uuid,text,uuid),public.confirm_delivery(uuid,integer,uuid),
 public.cancel_delivery(uuid,integer),public.report_delivery_incident(uuid,text,text,boolean),public.delivery_health() to authenticated;
-- Only shared operation status/events join Realtime. Never tokens, incidents,
-- receipts or attempts. No DELETE operations or grants are introduced.
do $$
declare v_table text;
begin
 foreach v_table in array array['delivery_operations','delivery_events'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=v_table) then
   execute format('alter publication supabase_realtime add table public.%I',v_table);
  end if;
 end loop;
end; $$;
notify pgrst,'reload schema';
commit;
-- END Pendejaditas delivery QR 202610240006
