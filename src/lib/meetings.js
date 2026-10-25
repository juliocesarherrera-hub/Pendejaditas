import { supabase } from './supabase';
export { mexicoTimeInput as mexicoInput, previousMeeting as isPrevious } from '../utils/meeting-time';
export const meetingStatus = { pending: 'Solicitud pendiente', accepted: 'Intercambio aceptado', rejected: 'Solicitud rechazada', cancelled: 'Cancelado', proposed: 'Propuesta pendiente', confirmed: 'Cita confirmada', declined: 'Propuesta rechazada' };
export const appointmentActions = { propose: 'Propuesta', reschedule: 'Reprogramación', accept: 'Aceptación', reject: 'Rechazo', cancel: 'Cancelación' };
export function meetingError(error) {
  if (['PGRST202','PGRST205','42P01'].includes(error?.code)) return 'Falta habilitar las citas con la migración nueva 202610240002_meetings.sql. No repitas la migración anterior.';
  if (error?.code === '42501') return 'La operación no te pertenece o esta respuesta corresponde a la otra persona.';
  if (['P0001','40001'].includes(error?.code)) return 'La solicitud o cita cambió. Actualiza antes de volver a responder.';
  if (error?.code === '22023') return 'Revisa el estado de la solicitud, el lugar y la hora: entre una hora y 90 días de anticipación, en horario de Querétaro.';
  return 'No se pudo completar la operación. Comprueba la conexión y vuelve a intentarlo.';
}
async function rpc(name, values = {}) {
  if (!supabase) throw new Error('Falta configurar Supabase.');
  const { data, error } = await supabase.rpc(name, values);
  if (error) throw new Error(meetingError(error));
  return data;
}
export const requestExchange = (id) => rpc('request_exchange', { p_product_id: id });
export const respondExchange = (id, action) => rpc('respond_exchange', { p_exchange_id: id, p_action: action });
export const changeAppointment = (id, action, revision, place = null, time = null) => rpc('change_appointment', { p_exchange_id: id, p_action: action, p_expected_revision: revision, p_place_id: place, p_local_time: time });
export async function fetchMeetingPlaces() {
  if (!supabase) throw new Error('Falta configurar Supabase.');
  const {data,error} = await supabase.from('meeting_places').select('id,name,address,zone,latitude,longitude,source_url,coordinates_source_url,verified_on').eq('active',true).order('name');
  if (error) throw new Error(meetingError(error));
  return data;
}
export async function fetchMeetings() {
  const health = await rpc('meetings_health');
  if (health?.version !== 3) throw new Error('La versión de citas no es compatible.');
  const [exchanges, appointments, events, places] = await Promise.all([
    supabase.from('exchange_requests').select('id,product_id,product_title,buyer_id,seller_id,status,created_at').order('created_at', { ascending: false }),
    supabase.from('exchange_appointments').select('id,exchange_id,place_id,starts_at,proposed_by,status,revision,updated_at'),
    supabase.from('appointment_events').select('id,exchange_id,actor_id,action,revision,place_id,starts_at,created_at').order('created_at', { ascending: false }),
    fetchMeetingPlaces(),
  ]);
  for (const result of [exchanges, appointments, events]) if (result.error) throw new Error(meetingError(result.error));
  return { exchanges: exchanges.data, appointments: appointments.data, events: events.data, places, serverTime: health.server_time };
}
export const formatMeetingTime = (value) => new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
