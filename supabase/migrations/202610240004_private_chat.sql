-- New stage only. Does not recreate or delete existing marketplace/meeting objects.
-- Voice tables are a disabled foundation: no call-start/join/token RPC is granted.
begin;
create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null unique references public.exchange_requests(id),
  last_sequence integer not null default 0 check(last_sequence>=0),
  created_at timestamptz not null default now(), last_message_at timestamptz
);
create table public.chat_participants (
  conversation_id uuid not null references public.chat_conversations(id),
  user_id uuid not null references public.profiles(id),
  role text not null check(role in('buyer','seller')),
  primary key(conversation_id,user_id), unique(conversation_id,role)
);
create index chat_participant_user_idx on public.chat_participants(user_id,conversation_id);
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id),
  sender_id uuid not null references public.profiles(id),
  sequence integer not null check(sequence>0),
  client_nonce uuid not null,
  body text not null check(char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default clock_timestamp(),
  unique(conversation_id,sequence), unique(conversation_id,sender_id,client_nonce),
  foreign key(conversation_id,sender_id) references public.chat_participants(conversation_id,user_id)
);
create index chat_sender_time_idx on public.chat_messages(sender_id,created_at);
create table public.chat_reads (
  conversation_id uuid not null, user_id uuid not null,
  last_read_sequence integer not null default 0 check(last_read_sequence>=0),
  updated_at timestamptz not null default now(),
  primary key(conversation_id,user_id),
  foreign key(conversation_id,user_id) references public.chat_participants(conversation_id,user_id)
);
create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id),
  blocked_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id), check(blocker_id<>blocked_id)
);
create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  reported_id uuid not null references public.profiles(id),
  conversation_id uuid not null references public.chat_conversations(id),
  message_id uuid references public.chat_messages(id),
  reason text not null check(reason in('harassment','spam','fraud','other')),
  details text not null default '' check(char_length(details)<=1000),
  status text not null default 'pending' check(status in('pending','reviewed')),
  created_at timestamptz not null default now(), check(reporter_id<>reported_id)
);
create index chat_reporter_time_idx on public.user_reports(reporter_id,created_at);
create table public.voice_call_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id),
  caller_id uuid not null, callee_id uuid not null, check(caller_id<>callee_id),
  status text not null check(status in('ringing','accepted','declined','cancelled','ended','missed','failed')),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default(now()+interval '30 seconds'),
  answered_at timestamptz, ended_at timestamptz,
  foreign key(conversation_id,caller_id) references public.chat_participants(conversation_id,user_id),
  foreign key(conversation_id,callee_id) references public.chat_participants(conversation_id,user_id),
  check(expires_at>requested_at)
);
create unique index voice_one_active_conversation on public.voice_call_requests(conversation_id) where status in('ringing','accepted');

-- RLS helper only answers membership of the caller; no arbitrary user parameter.
create function public.chat_is_member(p_conversation_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.chat_participants p where p.conversation_id=p_conversation_id and p.user_id=auth.uid())
$$;
create function public.chat_pair_blocked(p_a uuid,p_b uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_blocks b where (b.blocker_id=p_a and b.blocked_id=p_b) or (b.blocker_id=p_b and b.blocked_id=p_a))
$$;
alter table public.chat_conversations enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reads enable row level security;
alter table public.user_blocks enable row level security;
alter table public.user_reports enable row level security;
alter table public.voice_call_requests enable row level security;
revoke all on public.chat_conversations,public.chat_participants,public.chat_messages,public.chat_reads,public.user_blocks,public.user_reports,public.voice_call_requests from public,anon,authenticated;
grant select on public.chat_conversations,public.chat_participants,public.chat_messages,public.chat_reads,public.user_blocks,public.user_reports,public.voice_call_requests to authenticated;
create policy conversations_member_read on public.chat_conversations for select to authenticated using(public.chat_is_member(id));
create policy participants_member_read on public.chat_participants for select to authenticated using(public.chat_is_member(conversation_id));
create policy messages_member_read on public.chat_messages for select to authenticated using(public.chat_is_member(conversation_id));
create policy reads_owner_read on public.chat_reads for select to authenticated using(user_id=(select auth.uid()) and public.chat_is_member(conversation_id));
create policy blocks_owner_read on public.user_blocks for select to authenticated using(blocker_id=(select auth.uid()));
create policy reports_owner_read on public.user_reports for select to authenticated using(reporter_id=(select auth.uid()));
create policy calls_member_read on public.voice_call_requests for select to authenticated using(public.chat_is_member(conversation_id));

create function public.open_chat(p_exchange_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_exchange public.exchange_requests; v_id uuid;
begin
  select * into v_exchange from public.exchange_requests where id=p_exchange_id for share;
  if not found or v_user is null or v_user not in(v_exchange.buyer_id,v_exchange.seller_id) then raise exception 'Conversación no disponible.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(least(v_exchange.buyer_id,v_exchange.seller_id)::text||greatest(v_exchange.buyer_id,v_exchange.seller_id)::text,4));
  if v_exchange.status not in('pending','accepted') or public.chat_pair_blocked(v_exchange.buyer_id,v_exchange.seller_id) then raise exception 'La comunicación no está disponible.' using errcode='P0001'; end if;
  insert into public.chat_conversations(exchange_id) values(p_exchange_id) on conflict(exchange_id) do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.chat_conversations where exchange_id=p_exchange_id; end if;
  insert into public.chat_participants(conversation_id,user_id,role) values(v_id,v_exchange.buyer_id,'buyer'),(v_id,v_exchange.seller_id,'seller') on conflict do nothing;
  insert into public.chat_reads(conversation_id,user_id) values(v_id,v_exchange.buyer_id),(v_id,v_exchange.seller_id) on conflict do nothing;
  return v_id;
end; $$;

create function public.send_chat_message(p_conversation_id uuid,p_body text,p_client_nonce uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_other uuid; v_exchange uuid; v_status text; v_id uuid; v_sequence integer;
begin
  if not public.chat_is_member(p_conversation_id) then raise exception 'Conversación no disponible.' using errcode='42501'; end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 4000 or p_client_nonce is null then raise exception 'Escribe entre 1 y 4000 caracteres.' using errcode='22023'; end if;
  select user_id into v_other from public.chat_participants where conversation_id=p_conversation_id and user_id<>v_user;
  -- Consistent lock order: sender, pair, conversation. Block uses only the pair lock.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,5));
  perform pg_advisory_xact_lock(hashtextextended(least(v_user,v_other)::text||greatest(v_user,v_other)::text,4));
  select exchange_id,last_sequence into v_exchange,v_sequence from public.chat_conversations where id=p_conversation_id for update;
  select status into v_status from public.exchange_requests where id=v_exchange for share;
  if public.chat_pair_blocked(v_user,v_other) or v_status not in('pending','accepted') then raise exception 'La comunicación no está disponible.' using errcode='P0001'; end if;
  select id into v_id from public.chat_messages where conversation_id=p_conversation_id and sender_id=v_user and client_nonce=p_client_nonce;
  if v_id is not null then return v_id; end if;
  if (select count(*) from public.chat_messages where sender_id=v_user and created_at>clock_timestamp()-interval '5 seconds')>=5
     or (select count(*) from public.chat_messages where sender_id=v_user and created_at>clock_timestamp()-interval '1 minute')>=60 then
    raise exception 'Espera un momento antes de enviar más mensajes.' using errcode='P0001';
  end if;
  insert into public.chat_messages(conversation_id,sender_id,sequence,client_nonce,body) values(p_conversation_id,v_user,v_sequence+1,p_client_nonce,btrim(p_body)) returning id into v_id;
  update public.chat_conversations set last_sequence=v_sequence+1,last_message_at=clock_timestamp() where id=p_conversation_id;
  return v_id;
end; $$;

create function public.mark_chat_read(p_conversation_id uuid,p_upto_sequence integer) returns void
language plpgsql security definer set search_path='' as $$
declare v_max integer;
begin
  if not public.chat_is_member(p_conversation_id) then raise exception 'Conversación no disponible.' using errcode='42501'; end if;
  select last_sequence into v_max from public.chat_conversations where id=p_conversation_id;
  if p_upto_sequence is null or p_upto_sequence<0 or p_upto_sequence>v_max then raise exception 'Estado de lectura no válido.' using errcode='22023'; end if;
  insert into public.chat_reads(conversation_id,user_id,last_read_sequence) values(p_conversation_id,auth.uid(),p_upto_sequence)
    on conflict(conversation_id,user_id) do update set last_read_sequence=greatest(public.chat_reads.last_read_sequence,excluded.last_read_sequence),updated_at=clock_timestamp();
end; $$;

create function public.set_chat_block(p_user_id uuid,p_blocked boolean) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null or p_user_id is null or p_user_id=v_user or p_blocked is null or not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Usuario no disponible.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(least(v_user,p_user_id)::text||greatest(v_user,p_user_id)::text,4));
  if p_blocked then
    insert into public.user_blocks(blocker_id,blocked_id) values(v_user,p_user_id) on conflict do nothing;
  else delete from public.user_blocks where blocker_id=v_user and blocked_id=p_user_id;
  end if;
end; $$;

create function public.report_chat_user(p_conversation_id uuid,p_reason text,p_details text default '',p_message_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_other uuid; v_id uuid;
begin
  if not public.chat_is_member(p_conversation_id) then raise exception 'Conversación no disponible.' using errcode='42501'; end if;
  if p_reason is null or p_reason not in('harassment','spam','fraud','other') or p_details is null or char_length(p_details)>1000 then raise exception 'Reporte no válido.' using errcode='22023'; end if;
  if p_message_id is not null and not exists(select 1 from public.chat_messages where id=p_message_id and conversation_id=p_conversation_id) then raise exception 'Mensaje no disponible.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,5));
  if (select count(*) from public.user_reports where reporter_id=v_user and created_at>clock_timestamp()-interval '1 day')>=5 then raise exception 'Se alcanzó el límite diario de reportes.' using errcode='P0001'; end if;
  select user_id into v_other from public.chat_participants where conversation_id=p_conversation_id and user_id<>v_user;
  insert into public.user_reports(reporter_id,reported_id,conversation_id,message_id,reason,details) values(v_user,v_other,p_conversation_id,p_message_id,p_reason,p_details) returning id into v_id;
  return v_id;
end; $$;

create function public.chat_inbox() returns table(conversation_id uuid,exchange_id uuid,product_id uuid,product_title text,other_user_id uuid,other_name text,last_message_at timestamptz,last_message text,last_sequence integer,last_read_sequence integer,unread_count bigint,communication_allowed boolean)
language sql stable security definer set search_path='' as $$
  select c.id,c.exchange_id,e.product_id,e.product_title,other.user_id,profile.display_name,c.last_message_at,last_message.body,c.last_sequence,coalesce(r.last_read_sequence,0),
    (select count(*) from public.chat_messages m where m.conversation_id=c.id and m.sender_id<>auth.uid() and m.sequence>coalesce(r.last_read_sequence,0)),
    e.status in('pending','accepted') and not public.chat_pair_blocked(auth.uid(),other.user_id)
  from public.chat_participants own
    join public.chat_conversations c on c.id=own.conversation_id
    join public.chat_participants other on other.conversation_id=c.id and other.user_id<>own.user_id
    join public.profiles profile on profile.id=other.user_id
    join public.exchange_requests e on e.id=c.exchange_id
    left join public.chat_reads r on r.conversation_id=c.id and r.user_id=own.user_id
    left join public.chat_messages last_message on last_message.conversation_id=c.id and last_message.sequence=c.last_sequence
  where own.user_id=auth.uid() order by coalesce(c.last_message_at,c.created_at) desc,c.id
$$;
create function public.chat_health() returns integer language sql stable security invoker set search_path='' as $$ select 4 $$;

revoke all on function public.chat_is_member(uuid),public.chat_pair_blocked(uuid,uuid),public.open_chat(uuid),public.send_chat_message(uuid,text,uuid),public.mark_chat_read(uuid,integer),public.set_chat_block(uuid,boolean),public.report_chat_user(uuid,text,text,uuid),public.chat_inbox(),public.chat_health() from public,anon,authenticated;
grant execute on function public.chat_is_member(uuid),public.open_chat(uuid),public.send_chat_message(uuid,text,uuid),public.mark_chat_read(uuid,integer),public.set_chat_block(uuid,boolean),public.report_chat_user(uuid,text,text,uuid),public.chat_inbox(),public.chat_health() to authenticated;
grant execute on function public.chat_health() to anon;

-- Enable database changes on only the tables required by private chat subscriptions.
do $$
declare v_table text;
begin
  if not exists(select 1 from pg_publication where pubname='supabase_realtime') then raise exception 'Falta la publicación supabase_realtime. No se aplicó la migración.'; end if;
  foreach v_table in array array['chat_conversations','chat_messages','chat_reads','user_blocks','voice_call_requests'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=v_table) then
      execute format('alter publication supabase_realtime add table public.%I',v_table);
    end if;
  end loop;
end; $$;
notify pgrst,'reload schema';
commit;
-- END Pendejaditas private chat foundation 202610240004
