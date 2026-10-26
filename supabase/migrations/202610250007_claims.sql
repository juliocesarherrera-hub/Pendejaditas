-- PREPARED ONLY. Await owner authorization. Do not repeat migrations 001-006.
-- No sample cases, staff appointments, payments, permanent bans or money release.
begin;
do $$ begin
 if to_regclass('public.delivery_operations') is null or to_regclass('public.auction_results') is null
   or to_regclass('public.chat_conversations') is null then raise exception 'Faltan dependencias previas; revisa la instalación.'; end if;
 if to_regclass('public.claims') is not null then raise exception 'Reclamaciones ya existe; no repitas la migración.'; end if;
end; $$;

create table public.moderation_staff (
 user_id uuid primary key references public.profiles(id),role text not null check(role in('reviewer','supervisor')),
 active boolean not null,updated_at timestamptz not null default clock_timestamp()
);
create table public.moderation_staff_events (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),
 role text not null,active boolean not null,reason text not null,actor_db_role text not null default session_user,
 created_at timestamptz not null default clock_timestamp()
);
create table public.claims (
 id uuid primary key default gen_random_uuid(),exchange_id uuid not null references public.exchange_requests(id),
 target_kind text not null check(target_kind in('publication','appointment','delivery','exchange')),target_id uuid not null,
 product_id uuid, buyer_id uuid not null references public.profiles(id),seller_id uuid not null references public.profiles(id),
 opened_by uuid not null references public.profiles(id),open_nonce uuid not null,open_hash bytea not null,
 reason text not null check(reason in('counterfeit','defective','not_as_described','non_delivery','theft','threats','other')),
 status text not null default 'open' check(status in('open','awaiting_response','under_review','resolved','appealed')),
 context_snapshot jsonb not null,assigned_to uuid references public.profiles(id),revision integer not null default 1 check(revision>0),
 last_resolution_id uuid,appeal_of uuid,resolved_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(opened_by,open_nonce),check(buyer_id<>seller_id),check(opened_by in(buyer_id,seller_id)),
 check(assigned_to is null or assigned_to not in(buyer_id,seller_id))
);
create index claims_participants_idx on public.claims(buyer_id,seller_id,created_at);
create index claims_queue_idx on public.claims(status,created_at);
create unique index claims_one_active_target on public.claims(exchange_id,target_kind,target_id) where status<>'resolved';
create table public.claim_resolutions (
 id uuid primary key default gen_random_uuid(),claim_id uuid not null references public.claims(id),
 resolver_id uuid not null references public.profiles(id),
 outcome text not null check(outcome in('agreement','insufficient_evidence','substantiated','not_substantiated','unable_to_determine','other')),
 summary text not null check(char_length(btrim(summary)) between 20 and 4000),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.claims add foreign key(last_resolution_id) references public.claim_resolutions(id);
alter table public.claims add foreign key(appeal_of) references public.claim_resolutions(id);
create table public.claim_information_requests (
 id uuid primary key default gen_random_uuid(),claim_id uuid not null references public.claims(id),
 moderator_id uuid not null references public.profiles(id),recipient_id uuid not null references public.profiles(id),
 message text not null check(char_length(btrim(message)) between 10 and 2000),created_at timestamptz not null default clock_timestamp()
);
create table public.claim_statements (
 id uuid primary key default gen_random_uuid(),claim_id uuid not null references public.claims(id),author_id uuid not null references public.profiles(id),
 kind text not null check(kind in('opening','response','information','appeal','chat_excerpt')),body text not null check(char_length(btrim(body)) between (case when kind='chat_excerpt' then 1 else 20 end) and 4000),
 nonce uuid not null,request_id uuid references public.claim_information_requests(id),resolution_id uuid references public.claim_resolutions(id),
 source_message_id uuid references public.chat_messages(id),source_sender_id uuid references public.profiles(id),source_sent_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),unique(claim_id,author_id,nonce)
);
create unique index claim_one_appeal_per_party on public.claim_statements(resolution_id,author_id) where kind='appeal';
create unique index claim_one_information_reply on public.claim_statements(request_id,author_id) where request_id is not null;
create table public.claim_evidence (
 id uuid primary key default gen_random_uuid(),claim_id uuid not null references public.claims(id),uploader_id uuid not null references public.profiles(id),
 visibility text not null check(visibility in('moderators','participants')),storage_path text not null unique,
 expected_mime text not null check(expected_mime in('image/jpeg','image/png','image/webp','application/pdf')),
 status text not null default 'pending' check(status in('pending','sealed')),expires_at timestamptz not null,
 sha256_hex text check(sha256_hex~'^[0-9a-f]{64}$'),byte_size integer check(byte_size between 1 and 5242880),
 created_at timestamptz not null default clock_timestamp(),sealed_at timestamptz,
 check(status<>'sealed' or (sha256_hex is not null and byte_size is not null and sealed_at is not null))
);
create index claim_evidence_case_idx on public.claim_evidence(claim_id,created_at);
create table public.claim_events (
 id uuid primary key default gen_random_uuid(),claim_id uuid not null references public.claims(id),kind text not null,
 actor_id uuid references public.profiles(id),created_at timestamptz not null default clock_timestamp()
);
create table public.claim_admin_audit (
 id uuid primary key default gen_random_uuid(),claim_id uuid not null references public.claims(id),actor_id uuid not null references public.profiles(id),
 actor_mode text not null check(actor_mode in('moderator','participant','server')),action text not null,note text not null,
 details jsonb not null default '{}',created_at timestamptz not null default clock_timestamp()
);
create table public.claim_holds (
 id uuid primary key default gen_random_uuid(),claim_id uuid not null references public.claims(id),exchange_id uuid not null references public.exchange_requests(id),
 scope text not null check(scope in('exchange','delivery')),delivery_id uuid references public.delivery_operations(id),
 active boolean not null default true,expires_at timestamptz not null,reason text not null,
 created_at timestamptz not null default clock_timestamp(),released_at timestamptz,
 check((scope='delivery' and delivery_id is not null) or (scope='exchange' and delivery_id is null))
);
create index claim_holds_operation_idx on public.claim_holds(exchange_id,active,expires_at);
create table public.claim_attempts (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),action text not null,
 created_at timestamptz not null default clock_timestamp()
);
create index claim_attempts_user_idx on public.claim_attempts(user_id,created_at);

create function public.my_moderation_role() returns text language sql stable security definer set search_path='' as $$
 select s.role from public.moderation_staff s where s.user_id=auth.uid() and s.active and auth.jwt()->>'aal'='aal2'
$$;
create function public.can_moderate_claim(p_claim_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.my_moderation_role() is not null and exists(select 1 from public.claims c where c.id=p_claim_id
  and auth.uid() not in(c.buyer_id,c.seller_id) and not exists(select 1 from public.claim_resolutions r where r.id=c.appeal_of and r.resolver_id=auth.uid()))
$$;
create function public.can_read_claim(p_claim_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.claims c where c.id=p_claim_id and auth.uid() in(c.buyer_id,c.seller_id)) or public.can_moderate_claim(p_claim_id)
$$;
create function public.claim_rate(p_action text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,28));
 if (select count(*) from public.claim_attempts where user_id=auth.uid() and created_at>clock_timestamp()-interval '1 minute')>=20 then return false; end if;
 if p_action='open' and (select count(*) from public.claim_attempts where user_id=auth.uid() and action='open' and created_at>clock_timestamp()-interval '1 day')>=3 then return false; end if;
 insert into public.claim_attempts(user_id,action) values(auth.uid(),p_action);return true;
end; $$;
create function public.claim_lock(p_claim_id uuid,p_staff boolean default false) returns public.claims language plpgsql security definer set search_path='' as $$
declare c public.claims;
begin
 select * into c from public.claims where id=p_claim_id;
 if not found or auth.uid() is null then return null; end if;
 if p_staff then
  if not public.can_moderate_claim(c.id) then return null; end if;
 elsif auth.uid() not in(c.buyer_id,c.seller_id) then return null; end if;
 perform 1 from public.products where id=c.product_id for share;
 perform 1 from public.exchange_requests where id=c.exchange_id for update;
 perform 1 from public.exchange_appointments where exchange_id=c.exchange_id for update;
 perform 1 from public.delivery_operations where exchange_id=c.exchange_id order by id for update;
 select * into c from public.claims where id=p_claim_id for update;
 -- Recheck after waiting: an appeal or reassignment might have changed access.
 if p_staff and (not public.can_moderate_claim(c.id) or (c.assigned_to is not null and c.assigned_to<>auth.uid() and public.my_moderation_role()<>'supervisor')) then return null; end if;
 return c;
end; $$;

do $$ declare n text;begin
 foreach n in array array['moderation_staff','moderation_staff_events','claims','claim_resolutions','claim_information_requests','claim_statements','claim_evidence','claim_events','claim_admin_audit','claim_holds','claim_attempts'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated',n);
 end loop;
end; $$;
grant select on public.claims,public.claim_resolutions,public.claim_information_requests,public.claim_statements,public.claim_evidence,public.claim_events,public.claim_admin_audit,public.claim_holds to authenticated;
create policy claims_private_read on public.claims for select to authenticated using(public.can_read_claim(id));
create policy claim_resolutions_private_read on public.claim_resolutions for select to authenticated using(public.can_read_claim(claim_id));
create policy claim_requests_private_read on public.claim_information_requests for select to authenticated using(public.can_read_claim(claim_id));
create policy claim_statements_private_read on public.claim_statements for select to authenticated using(public.can_read_claim(claim_id));
create policy claim_events_private_read on public.claim_events for select to authenticated using(public.can_read_claim(claim_id));
create policy claim_audit_staff_read on public.claim_admin_audit for select to authenticated using(public.can_moderate_claim(claim_id));
create policy claim_holds_private_read on public.claim_holds for select to authenticated using(public.can_read_claim(claim_id));
create policy claim_evidence_private_read on public.claim_evidence for select to authenticated using(
 uploader_id=(select auth.uid()) or public.can_moderate_claim(claim_id) or (status='sealed' and visibility='participants' and public.can_read_claim(claim_id)));

create function public.claim_append_only() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'El historial es inmutable; añade un registro nuevo.' using errcode='P0001';end; $$;
do $$ declare n text;begin
 foreach n in array array['moderation_staff_events','claim_resolutions','claim_information_requests','claim_statements','claim_events','claim_admin_audit'] loop
  execute format('create trigger claim_history_immutable before update or delete on public.%I for each row execute function public.claim_append_only()',n);
 end loop;
end; $$;
create function public.claim_evidence_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or old.status='sealed' then raise exception 'La prueba se conserva sin modificaciones.' using errcode='P0001'; end if;
 return new;
end; $$;
create trigger claim_evidence_preserve before update or delete on public.claim_evidence for each row execute function public.claim_evidence_immutable();

create function public.set_moderation_staff(p_user_id uuid,p_role text,p_active boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_role is null or p_role not in('reviewer','supervisor') or p_active is null or p_reason is null or char_length(btrim(p_reason)) not between 10 and 1500 then raise exception 'Revisa el nombramiento y su motivo.' using errcode='22023'; end if;
 insert into public.moderation_staff(user_id,role,active) values(p_user_id,p_role,p_active) on conflict(user_id) do update set role=excluded.role,active=excluded.active,updated_at=clock_timestamp();
 insert into public.moderation_staff_events(user_id,role,active,reason) values(p_user_id,p_role,p_active,btrim(p_reason));
end; $$;

create function public.open_claim(p_exchange_id uuid,p_target_kind text,p_target_id uuid,p_reason text,p_body text,p_nonce uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.exchange_requests;p public.products;a public.exchange_appointments;d public.delivery_operations;c public.claims;v_hash bytea;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 if p_nonce is null or p_exchange_id is null or p_target_id is null or p_target_kind is null or p_target_kind not in('publication','appointment','delivery','exchange') or p_body is null or char_length(btrim(p_body)) not between 20 and 4000 or p_reason is null or p_reason not in('counterfeit','defective','not_as_described','non_delivery','theft','threats','other') then
  if not public.claim_rate('invalid_open') then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
  return jsonb_build_object('ok',false,'code','invalid_input');
 end if;
 v_hash:=sha256(convert_to(jsonb_build_array(p_exchange_id,p_target_kind,p_target_id,p_reason,p_body)::text,'UTF8'));
 select * into c from public.claims where opened_by=auth.uid() and open_nonce=p_nonce;
 if found then return jsonb_build_object('ok',c.open_hash=v_hash,'code',case when c.open_hash=v_hash then 'existing' else 'nonce_conflict' end,'claim_id',c.id); end if;
 if not public.claim_rate('open') then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
 select * into e from public.exchange_requests where id=p_exchange_id;
 if not found or auth.uid() not in(e.buyer_id,e.seller_id) then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 select * into p from public.products where id=e.product_id for share;
 select * into e from public.exchange_requests where id=p_exchange_id for update;
 select * into a from public.exchange_appointments where exchange_id=e.id for update;
 if p_target_kind='delivery' then select * into d from public.delivery_operations where id=p_target_id and exchange_id=e.id for update; end if;
 if p_nonce is null or p_body is null or char_length(btrim(p_body)) not between 20 and 4000 or p_reason is null
  or p_reason not in('counterfeit','defective','not_as_described','non_delivery','theft','threats','other') then return jsonb_build_object('ok',false,'code','invalid_input'); end if;
 if p_target_kind is null or p_target_id is null or not coalesce(((p_target_kind='publication' and p.id=p_target_id) or (p_target_kind='appointment' and a.id=p_target_id) or (p_target_kind='delivery' and d.id=p_target_id) or (p_target_kind='exchange' and e.id=p_target_id)),false) then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 if exists(select 1 from public.claims where exchange_id=e.id and target_kind=p_target_kind and target_id=p_target_id and status='resolved' and resolved_at>clock_timestamp()-interval '7 days') then return jsonb_build_object('ok',false,'code','appeal_existing_case'); end if;
 begin
  insert into public.claims(exchange_id,target_kind,target_id,product_id,buyer_id,seller_id,opened_by,open_nonce,open_hash,reason,context_snapshot)
   values(e.id,p_target_kind,p_target_id,e.product_id,e.buyer_id,e.seller_id,auth.uid(),p_nonce,v_hash,p_reason,
    jsonb_build_object('product',to_jsonb(p),'exchange',to_jsonb(e),'appointment',to_jsonb(a),'delivery',to_jsonb(d),'snapshot_at',clock_timestamp())) returning * into c;
 exception when unique_violation then return jsonb_build_object('ok',false,'code','existing_case_or_attempt'); end;
 insert into public.claim_statements(claim_id,author_id,kind,body,nonce) values(c.id,auth.uid(),'opening',btrim(p_body),p_nonce);
 insert into public.claim_events(claim_id,actor_id,kind) values(c.id,auth.uid(),'opened');
 return jsonb_build_object('ok',true,'claim_id',c.id,'revision',c.revision,'payments_enabled',false);
end; $$;

create function public.submit_claim_statement(p_claim_id uuid,p_body text,p_nonce uuid,p_request_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.claims;s public.claim_statements;r public.claim_information_requests;
begin
 if not public.claim_rate('statement') then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
 c:=public.claim_lock(p_claim_id);if c.id is null then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 select * into s from public.claim_statements where claim_id=c.id and author_id=auth.uid() and nonce=p_nonce;
 if found then return jsonb_build_object('ok',s.body=btrim(p_body) and s.request_id is not distinct from p_request_id,'statement_id',s.id,'duplicate',true); end if;
 if c.status='resolved' or p_nonce is null or p_body is null or char_length(btrim(p_body)) not between 20 and 4000 then return jsonb_build_object('ok',false,'code','invalid_input_or_closed'); end if;
 if (select count(*) from public.claim_statements where claim_id=c.id and author_id=auth.uid())>=30 then return jsonb_build_object('ok',false,'code','statement_limit'); end if;
 if p_request_id is not null then
  select * into r from public.claim_information_requests where id=p_request_id and claim_id=c.id and recipient_id=auth.uid();
  if not found or exists(select 1 from public.claim_statements where request_id=r.id and author_id=auth.uid()) then return jsonb_build_object('ok',false,'code','request_unavailable'); end if;
 end if;
 insert into public.claim_statements(claim_id,author_id,kind,body,nonce,request_id) values(c.id,auth.uid(),case when p_request_id is null then 'response' else 'information' end,btrim(p_body),p_nonce,p_request_id) returning * into s;
 update public.claims set revision=revision+1,updated_at=clock_timestamp() where id=c.id;
 insert into public.claim_events(claim_id,actor_id,kind) values(c.id,auth.uid(),'statement_added');
 return jsonb_build_object('ok',true,'statement_id',s.id);
end; $$;

create function public.attach_claim_chat_message(p_claim_id uuid,p_message_id uuid,p_nonce uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.claims;m public.chat_messages;s public.claim_statements;
begin
 if not public.claim_rate('chat_excerpt') then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
 c:=public.claim_lock(p_claim_id);if c.id is null then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 select * into s from public.claim_statements where claim_id=c.id and author_id=auth.uid() and nonce=p_nonce;
 if found then return jsonb_build_object('ok',s.kind='chat_excerpt' and s.source_message_id=p_message_id,'statement_id',s.id,'duplicate',true); end if;
 if c.status='resolved' or p_nonce is null then return jsonb_build_object('ok',false,'code','invalid_input_or_closed'); end if;
 if (select count(*) from public.claim_statements where claim_id=c.id and author_id=auth.uid())>=30 then return jsonb_build_object('ok',false,'code','statement_limit'); end if;
 select msg.* into m from public.chat_messages msg join public.chat_conversations cv on cv.id=msg.conversation_id where msg.id=p_message_id and cv.exchange_id=c.exchange_id and msg.sender_id in(c.buyer_id,c.seller_id);
 if not found then return jsonb_build_object('ok',false,'code','message_unavailable'); end if;
 insert into public.claim_statements(claim_id,author_id,kind,body,nonce,source_message_id,source_sender_id,source_sent_at)
  values(c.id,auth.uid(),'chat_excerpt',m.body,p_nonce,m.id,m.sender_id,m.created_at) returning * into s;
 update public.claims set revision=revision+1,updated_at=clock_timestamp() where id=c.id;
 insert into public.claim_events(claim_id,actor_id,kind) values(c.id,auth.uid(),'chat_excerpt_added');
 return jsonb_build_object('ok',true,'statement_id',s.id);
end; $$;

create function public.appeal_claim(p_claim_id uuid,p_body text,p_nonce uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.claims;r public.claim_resolutions;s public.claim_statements;
begin
 if not public.claim_rate('appeal') then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
 c:=public.claim_lock(p_claim_id);if c.id is null then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 select * into s from public.claim_statements where claim_id=c.id and author_id=auth.uid() and nonce=p_nonce;
 if found then return jsonb_build_object('ok',s.kind='appeal' and s.body=btrim(p_body),'statement_id',s.id,'duplicate',true); end if;
 select * into r from public.claim_resolutions where id=c.last_resolution_id;
 if c.status not in('resolved','appealed') or r.id is null or clock_timestamp()>r.created_at+interval '7 days' or p_nonce is null or p_body is null or char_length(btrim(p_body)) not between 20 and 4000 then return jsonb_build_object('ok',false,'code','appeal_unavailable'); end if;
 if exists(select 1 from public.claim_statements where resolution_id=r.id and author_id=auth.uid() and kind='appeal') then return jsonb_build_object('ok',false,'code','already_appealed'); end if;
 insert into public.claim_statements(claim_id,author_id,kind,body,nonce,resolution_id) values(c.id,auth.uid(),'appeal',btrim(p_body),p_nonce,r.id);
 update public.claims set status='appealed',appeal_of=r.id,assigned_to=null,revision=revision+1,updated_at=clock_timestamp() where id=c.id;
 insert into public.claim_events(claim_id,actor_id,kind) values(c.id,auth.uid(),'appealed');
 return jsonb_build_object('ok',true,'claim_id',c.id,'payments_enabled',false);
end; $$;

create function public.reserve_claim_evidence(p_claim_id uuid,p_mime text,p_visibility text default 'moderators') returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.claims;v_id uuid:=gen_random_uuid();v_path text;v_extension text;
begin
 if not public.claim_rate('reserve_evidence') then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
 c:=public.claim_lock(p_claim_id);if c.id is null then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 if c.status='resolved' or p_mime is null or p_mime not in('image/jpeg','image/png','image/webp','application/pdf') or p_visibility is null or p_visibility not in('moderators','participants') then return jsonb_build_object('ok',false,'code','invalid_input_or_closed'); end if;
 if (select count(*) from public.claim_evidence where claim_id=c.id and uploader_id=auth.uid())>=20 then return jsonb_build_object('ok',false,'code','evidence_limit'); end if;
 v_extension:=case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' else 'pdf' end;
 v_path:=c.id::text||'/'||v_id::text||'.'||v_extension;
 insert into public.claim_evidence(id,claim_id,uploader_id,visibility,storage_path,expected_mime,expires_at) values(v_id,c.id,auth.uid(),p_visibility,v_path,p_mime,clock_timestamp()+interval '15 minutes');
 return jsonb_build_object('ok',true,'evidence_id',v_id,'path',v_path,'bucket','claim-evidence');
end; $$;
create function public.claim_upload_allowed(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.claim_evidence e join public.claims c on c.id=e.claim_id where e.storage_path=p_name and e.uploader_id=auth.uid()
  and auth.uid() in(c.buyer_id,c.seller_id) and e.status='pending' and e.expires_at>clock_timestamp() and c.status<>'resolved')
$$;
create function public.claim_file_read_allowed(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.claim_evidence e join public.claims c on c.id=e.claim_id where e.storage_path=p_name
  and (e.uploader_id=auth.uid() or (e.status='sealed' and e.visibility='participants' and auth.uid() in(c.buyer_id,c.seller_id))))
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('claim-evidence','claim-evidence',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']);
create policy claim_files_insert on storage.objects for insert to authenticated with check(bucket_id='claim-evidence' and public.claim_upload_allowed(name));
create policy claim_files_read on storage.objects for select to authenticated using(bucket_id='claim-evidence' and public.claim_file_read_allowed(name));
-- Restrictive policies prevent future broad permissive policies from granting
-- uploads/reads/overwrites/deletions in this bucket. Other buckets stay unchanged.
create policy claim_files_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'claim-evidence' or public.claim_upload_allowed(name));
create policy claim_files_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'claim-evidence' or public.claim_file_read_allowed(name));
create policy claim_files_update_guard on storage.objects as restrictive for update to authenticated using(bucket_id<>'claim-evidence') with check(bucket_id<>'claim-evidence');
create policy claim_files_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'claim-evidence');

create function public.claim_evidence_upload_context(p_evidence_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',e.id,'path',e.storage_path,'mime',e.expected_mime,'status',e.status) from public.claim_evidence e join public.claims c on c.id=e.claim_id
  where e.id=p_evidence_id and e.uploader_id=auth.uid() and c.status<>'resolved' and e.expires_at>clock_timestamp() and e.status='pending'
$$;
-- Only the Edge Function service role may seal: it downloads the immutable file,
-- checks its format/size and computes the hash of actual bytes, not a client hash.
create function public.seal_claim_evidence(p_evidence_id uuid,p_uploader_id uuid,p_sha256 text,p_bytes integer,p_mime text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.claim_evidence;c public.claims;
begin
 select * into e from public.claim_evidence where id=p_evidence_id;
 if not found or e.uploader_id<>p_uploader_id then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 select * into c from public.claims where id=e.claim_id;
 perform 1 from public.products where id=c.product_id for share;
 perform 1 from public.exchange_requests where id=c.exchange_id for update;
 perform 1 from public.exchange_appointments where exchange_id=c.exchange_id for update;
 perform 1 from public.delivery_operations where exchange_id=c.exchange_id order by id for update;
 select * into c from public.claims where id=e.claim_id for update;
 select * into e from public.claim_evidence where id=p_evidence_id for update;
 if e.status='sealed' then return jsonb_build_object('ok',e.sha256_hex=p_sha256 and e.byte_size=p_bytes,'evidence_id',e.id,'duplicate',true); end if;
 if c.status='resolved' or e.expires_at<=clock_timestamp() or p_sha256 is null or p_sha256!~'^[0-9a-f]{64}$' or p_bytes is null or p_bytes not between 1 and 5242880 or p_mime is distinct from e.expected_mime then return jsonb_build_object('ok',false,'code','invalid_evidence'); end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='claim-evidence' and o.name=e.storage_path and o.owner_id=p_uploader_id::text) then return jsonb_build_object('ok',false,'code','missing_upload'); end if;
 update public.claim_evidence set status='sealed',sha256_hex=p_sha256,byte_size=p_bytes,sealed_at=clock_timestamp() where id=e.id;
 if e.visibility='participants' then insert into public.claim_events(claim_id,actor_id,kind) values(c.id,p_uploader_id,'evidence_added'); end if;
 return jsonb_build_object('ok',true,'evidence_id',e.id,'authenticity','not_determined');
end; $$;

create function public.authorize_claim_evidence_download(p_evidence_id uuid,p_as_moderator boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.claim_evidence;c public.claims;
begin
 if not public.claim_rate('evidence_access') then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
 select * into e from public.claim_evidence where id=p_evidence_id;
 if not found or e.status<>'sealed' or p_as_moderator is null then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 if p_as_moderator then
  if not public.can_moderate_claim(e.claim_id) then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 elsif not public.claim_file_read_allowed(e.storage_path) then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 select * into c from public.claims where id=e.claim_id for share;
 -- An appeal can change moderator eligibility while this transaction waits.
 if p_as_moderator and not public.can_moderate_claim(e.claim_id) then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 insert into public.claim_admin_audit(claim_id,actor_id,actor_mode,action,note,details)
  values(c.id,auth.uid(),case when p_as_moderator then 'moderator' else 'participant' end,'evidence_access_authorized','Acceso autorizado al archivo privado.',jsonb_build_object('evidence_id',e.id));
 return jsonb_build_object('ok',true,'path',e.storage_path,'mime',e.expected_mime,'sha256',e.sha256_hex,'bytes',e.byte_size);
end; $$;

create function public.moderate_claim(p_claim_id uuid,p_action text,p_expected_revision integer,p_message text,p_recipient uuid default null,p_outcome text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.claims;v_resolution uuid;
begin
 if not public.claim_rate('moderate') then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
 c:=public.claim_lock(p_claim_id,true);if c.id is null then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 if p_expected_revision is distinct from c.revision or c.status='resolved' then return jsonb_build_object('ok',false,'code','stale_or_closed'); end if;
 if p_message is null or char_length(btrim(p_message)) not between 20 and 2000 then return jsonb_build_object('ok',false,'code','justification_required'); end if;
 if p_action='review' then
  update public.claims set status='under_review',assigned_to=auth.uid(),revision=revision+1,updated_at=clock_timestamp() where id=c.id;
 elsif p_action='request_information' then
  if p_recipient is null or p_recipient not in(c.buyer_id,c.seller_id) then return jsonb_build_object('ok',false,'code','invalid_recipient'); end if;
  insert into public.claim_information_requests(claim_id,moderator_id,recipient_id,message) values(c.id,auth.uid(),p_recipient,btrim(p_message));
  update public.claims set status='awaiting_response',assigned_to=auth.uid(),revision=revision+1,updated_at=clock_timestamp() where id=c.id;
 elsif p_action='resolve' then
  if p_outcome is null or p_outcome not in('agreement','insufficient_evidence','substantiated','not_substantiated','unable_to_determine','other') then return jsonb_build_object('ok',false,'code','invalid_resolution'); end if;
  insert into public.claim_resolutions(claim_id,resolver_id,outcome,summary) values(c.id,auth.uid(),p_outcome,btrim(p_message)) returning id into v_resolution;
  update public.claims set status='resolved',last_resolution_id=v_resolution,appeal_of=null,resolved_at=clock_timestamp(),assigned_to=auth.uid(),revision=revision+1,updated_at=clock_timestamp() where id=c.id;
 else return jsonb_build_object('ok',false,'code','invalid_action'); end if;
 insert into public.claim_admin_audit(claim_id,actor_id,actor_mode,action,note,details) values(c.id,auth.uid(),'moderator',p_action,btrim(p_message),jsonb_build_object('previous_revision',c.revision,'resolution_id',v_resolution));
 insert into public.claim_events(claim_id,kind) values(c.id,case p_action when 'review' then 'review_started' when 'resolve' then 'resolved' else 'information_requested' end);
 return jsonb_build_object('ok',true,'claim_id',c.id,'payments_enabled',false);
end; $$;

-- Holds affect coordination/handover only, not bidding, auction clocks, accounts
-- or money. Closing a claim does not silently release a hold from any case.
create function public.claim_operation_held(p_exchange_id uuid,p_delivery_id uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.claim_holds h where h.exchange_id=p_exchange_id and h.active and h.expires_at>clock_timestamp()
  and (h.scope='exchange' or h.delivery_id=p_delivery_id))
$$;
create function public.claim_hold_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare v_exchange uuid;v_delivery uuid;
begin
 if tg_table_name='exchange_requests' then v_exchange:=new.id;
 elsif tg_table_name='exchange_appointments' then v_exchange:=new.exchange_id;
 else v_exchange:=new.exchange_id;v_delivery:=new.id;end if;
 if public.claim_operation_held(v_exchange,v_delivery) then
  -- Existing RPCs can still stop an operation or report a disagreement safely.
  if tg_op='UPDATE' and new.status in('cancelled','review') then return new; end if;
  raise exception 'Operación pausada temporalmente para revisión. Puedes consultar el historial o reportar un incidente.' using errcode='P0001';
 end if;
 return new;
end; $$;
create trigger claim_exchange_hold before update on public.exchange_requests for each row execute function public.claim_hold_guard();
create trigger claim_appointment_hold before insert or update on public.exchange_appointments for each row execute function public.claim_hold_guard();
create trigger claim_delivery_hold before insert or update on public.delivery_operations for each row execute function public.claim_hold_guard();
create function public.set_claim_hold(p_claim_id uuid,p_scope text,p_delivery_id uuid,p_hours integer,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.claims;v_id uuid;d public.delivery_operations;
begin
 if not public.claim_rate('hold') then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
 c:=public.claim_lock(p_claim_id,true);if c.id is null then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 if c.status='resolved' or p_scope is null or p_scope not in('exchange','delivery') or p_hours is null or p_hours not between 1 and 72 or p_reason is null or char_length(btrim(p_reason)) not between 20 and 1500 then return jsonb_build_object('ok',false,'code','invalid_hold'); end if;
 if p_scope='delivery' and (p_delivery_id is null or not exists(select 1 from public.delivery_operations where id=p_delivery_id and exchange_id=c.exchange_id)) then return jsonb_build_object('ok',false,'code','invalid_target'); end if;
 for d in select * from public.delivery_operations where exchange_id=c.exchange_id and (p_scope='exchange' or id=p_delivery_id) and status in('ready','awaiting_confirmation') order by id for update loop
  update public.delivery_qr_tokens set revoked_at=clock_timestamp() where operation_id=d.id and revoked_at is null;
  update public.delivery_operations set status='cancelled',revision=revision+1,updated_at=clock_timestamp() where id=d.id;
  insert into public.delivery_events(operation_id,kind) values(d.id,'moderation_hold');
 end loop;
 insert into public.claim_holds(claim_id,exchange_id,scope,delivery_id,expires_at,reason) values(c.id,c.exchange_id,p_scope,case when p_scope='delivery' then p_delivery_id else null end,clock_timestamp()+make_interval(hours=>p_hours),btrim(p_reason)) returning id into v_id;
 insert into public.claim_admin_audit(claim_id,actor_id,actor_mode,action,note,details) values(c.id,auth.uid(),'moderator','hold_applied',btrim(p_reason),jsonb_build_object('hold_id',v_id,'hours',p_hours,'scope',p_scope));
 insert into public.claim_events(claim_id,kind) values(c.id,'operation_held');
 return jsonb_build_object('ok',true,'hold_id',v_id,'payments_enabled',false);
end; $$;
create function public.release_claim_hold(p_claim_id uuid,p_hold_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.claims;
begin
 if not public.claim_rate('release_hold') then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
 c:=public.claim_lock(p_claim_id,true);if c.id is null then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 20 and 1500 then return jsonb_build_object('ok',false,'code','justification_required'); end if;
 update public.claim_holds set active=false,released_at=clock_timestamp() where id=p_hold_id and claim_id=c.id and active;
 if not found then return jsonb_build_object('ok',false,'code','hold_unavailable'); end if;
 insert into public.claim_admin_audit(claim_id,actor_id,actor_mode,action,note,details) values(c.id,auth.uid(),'moderator','hold_released',btrim(p_reason),jsonb_build_object('hold_id',p_hold_id));
 insert into public.claim_events(claim_id,kind) values(c.id,'hold_released');
 return jsonb_build_object('ok',true,'payments_enabled',false);
end; $$;
create function public.claims_health() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',7,'server_time',clock_timestamp(),'payments_enabled',false,'evidence_private',exists(select 1 from storage.buckets where id='claim-evidence' and not public))
$$;
create function public.moderation_queue(p_limit integer default 50) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if public.my_moderation_role() is null then return jsonb_build_object('ok',false,'code','moderator_mfa_required'); end if;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from
  (select id,reason,status,revision,assigned_to,created_at from public.claims where public.can_moderate_claim(id) order by created_at limit least(greatest(coalesce(p_limit,50),1),100)) q;
 return jsonb_build_object('ok',true,'cases',result);
end; $$;
create function public.moderation_case(p_claim_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.claims;
begin
 if not public.can_moderate_claim(p_claim_id) then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 select * into c from public.claims where id=p_claim_id for share;
 if not public.can_moderate_claim(p_claim_id) then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 insert into public.claim_admin_audit(claim_id,actor_id,actor_mode,action,note) values(c.id,auth.uid(),'moderator','case_view_authorized','Acceso autorizado al expediente de moderación.');
 return jsonb_build_object('ok',true,'case',to_jsonb(c),
  'statements',(select coalesce(jsonb_agg(to_jsonb(s) order by created_at),'[]'::jsonb) from public.claim_statements s where claim_id=c.id),
  'requests',(select coalesce(jsonb_agg(to_jsonb(r) order by created_at),'[]'::jsonb) from public.claim_information_requests r where claim_id=c.id),
  'resolutions',(select coalesce(jsonb_agg(to_jsonb(r) order by created_at),'[]'::jsonb) from public.claim_resolutions r where claim_id=c.id),
  'evidence',(select coalesce(jsonb_agg(to_jsonb(e) order by created_at),'[]'::jsonb) from public.claim_evidence e where claim_id=c.id and status='sealed'),
  'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by created_at),'[]'::jsonb) from public.claim_admin_audit a where claim_id=c.id));
end; $$;

-- Explicit allow-list of frontend functions; helpers needed by RLS only answer
-- authorization for auth.uid(). No arbitrary user/role can be supplied.
do $$ declare signature text;begin
 foreach signature in array array[
 'public.my_moderation_role()',
 'public.can_moderate_claim(uuid)',
 'public.can_read_claim(uuid)',
 'public.claim_rate(text)',
 'public.claim_lock(uuid,boolean)',
 'public.claim_append_only()',
 'public.claim_evidence_immutable()',
 'public.set_moderation_staff(uuid,text,boolean,text)',
 'public.open_claim(uuid,text,uuid,text,text,uuid)',
 'public.submit_claim_statement(uuid,text,uuid,uuid)',
 'public.attach_claim_chat_message(uuid,uuid,uuid)',
 'public.appeal_claim(uuid,text,uuid)',
 'public.reserve_claim_evidence(uuid,text,text)',
 'public.claim_upload_allowed(text)',
 'public.claim_file_read_allowed(text)',
 'public.claim_evidence_upload_context(uuid)',
 'public.seal_claim_evidence(uuid,uuid,text,integer,text)',
 'public.authorize_claim_evidence_download(uuid,boolean)',
 'public.moderate_claim(uuid,text,integer,text,uuid,text)',
 'public.claim_operation_held(uuid,uuid)',
 'public.claim_hold_guard()',
 'public.set_claim_hold(uuid,text,uuid,integer,text)',
 'public.release_claim_hold(uuid,uuid,text)',
 'public.claims_health()',
 'public.moderation_queue(integer)',
 'public.moderation_case(uuid)'] loop
  execute 'revoke all on function '||signature||' from public,anon,authenticated,service_role';
 end loop;
end; $$;
grant execute on function public.my_moderation_role(),public.can_moderate_claim(uuid),public.can_read_claim(uuid),public.claim_upload_allowed(text),public.claim_file_read_allowed(text),
 public.open_claim(uuid,text,uuid,text,text,uuid),public.submit_claim_statement(uuid,text,uuid,uuid),public.attach_claim_chat_message(uuid,uuid,uuid),public.appeal_claim(uuid,text,uuid),public.reserve_claim_evidence(uuid,text,text),
 public.claim_evidence_upload_context(uuid),public.authorize_claim_evidence_download(uuid,boolean),public.moderate_claim(uuid,text,integer,text,uuid,text),
 public.set_claim_hold(uuid,text,uuid,integer,text),public.release_claim_hold(uuid,uuid,text),public.claims_health(),public.moderation_queue(integer),public.moderation_case(uuid) to authenticated;
grant execute on function public.seal_claim_evidence(uuid,uuid,text,integer,text) to service_role;
grant execute on function public.set_moderation_staff(uuid,text,boolean,text) to postgres;
-- Realtime stays unchanged: no documents, moderator notes or staff roster stream.
notify pgrst,'reload schema';
commit;
-- END Pendejaditas claims and moderation 202610250007
