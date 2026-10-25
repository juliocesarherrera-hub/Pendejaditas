-- Correction only: replace two existing RPC definitions. No table, row or policy changes.
-- Apply ONLY this file after 202610240002_meetings.sql; do not repeat earlier migrations.
begin;
create or replace function public.respond_exchange(p_exchange_id uuid,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_exchange public.exchange_requests;
begin
  select * into v_exchange from public.exchange_requests where id=p_exchange_id for update;
  if not found or v_user is null or v_user not in(v_exchange.buyer_id,v_exchange.seller_id) then raise exception 'Operación no disponible.' using errcode='42501'; end if;
  if v_exchange.status<>'pending' then raise exception 'La solicitud ya cambió. Actualiza.' using errcode='P0001'; end if;
  if (p_action in('accept','reject') and v_user=v_exchange.seller_id) then
    update public.exchange_requests set status=case when p_action='accept' then 'accepted' else 'rejected' end,updated_at=clock_timestamp() where id=p_exchange_id;
  elsif p_action='cancel' and v_user=v_exchange.buyer_id then
    update public.exchange_requests set status='cancelled',updated_at=clock_timestamp() where id=p_exchange_id;
  else raise exception 'Acción no permitida.' using errcode='42501'; end if;
end; $$;

create or replace function public.change_appointment(p_exchange_id uuid,p_action text,p_expected_revision integer default 0,p_place_id text default null,p_local_time timestamp without time zone default null) returns uuid
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
    raise exception 'La cita cambió. Actualiza antes de responder.' using errcode='P0001';
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
notify pgrst, 'reload schema';
commit;
-- END Pendejaditas stale revision fix 202610240003
