import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, ExternalLink, RefreshCw } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { chat } from '../lib/chat';
import { googleMapsUrl } from '../data/meetingPlaces';
import { appointmentActions, changeAppointment, fetchMeetings, formatMeetingTime, isPrevious, meetingStatus, mexicoInput, respondExchange } from '../lib/meetings';

function ProposalForm({ places, selectedPlace, exchange, appointment, busy, onPropose }) {
  const [placeId, setPlaceId] = useState(selectedPlace || appointment?.place_id || '');
  const [time, setTime] = useState('');
  const [minTime] = useState(() => mexicoInput(new Date(Date.now()+3660000)));
  return <form className="appointment-proposal" onSubmit={(event) => { event.preventDefault(); onPropose(exchange.id, appointment?.revision || 0, placeId, time); }}>
    <h3>{appointment ? 'Proponer una reprogramación' : 'Proponer lugar y fecha'}</h3><label>Lugar público sugerido<select value={placeId} onChange={(event) => setPlaceId(event.target.value)} required disabled={busy}><option value="">Selecciona un establecimiento</option>{places.map((place) => <option key={place.id} value={place.id}>{place.name} · {place.zone}</option>)}</select></label><label>Fecha y hora de Querétaro<input type="datetime-local" value={time} onChange={(event) => setTime(event.target.value)} required disabled={busy} min={minTime} /></label><p className="field-hint">Entre una hora y 90 días de anticipación. Horario America/Mexico_City. Revisa los horarios de apertura; la otra persona deberá aceptar.</p><button className="primary-button" disabled={busy || !places.length}>{busy ? 'Enviando…' : 'Enviar propuesta'}</button>
  </form>;
}

export function AppointmentsPage({ user, navigate, selectedPlace, exchangeId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('pending');
  const [clock, setClock] = useState(() => ({ offset: 0, now: Date.now() }));
  const [editing, setEditing] = useState(null);
  const refresh = useCallback(async () => {
    try {
      const next = await fetchMeetings();
      setData(next); setError('');
      const now = Date.now(); setClock({ offset: new Date(next.serverTime).getTime()-now, now: new Date(next.serverTime).getTime() });
    } catch (failure) { setError(failure.message); }
  }, []);
  useEffect(() => {
    let active = true;
    const sync = () => { if (active && !document.hidden) refresh(); };
    Promise.resolve().then(sync);
    const timer = setInterval(sync,30000);
    window.addEventListener('focus',sync);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus',sync); };
  }, [refresh]);
  useEffect(() => { const timer = setInterval(() => setClock((current) => ({ ...current, now: Date.now()+current.offset })),10000); return () => clearInterval(timer); }, []);
  async function run(action, success) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); setMessage(success); setEditing(null); await refresh(); }
    catch (failure) { await refresh(); setError(failure.message); }
    finally { setBusy(false); }
  }
  const propose = (id, revision, placeId, time) => run(() => changeAppointment(id,'propose',revision,placeId,time), 'Propuesta guardada. Falta la aceptación de la otra persona.');
  const visible = data?.exchanges.filter((exchange) => exchangeId ? exchange.id === exchangeId : isPrevious(exchange,data.appointments.find((entry) => entry.exchange_id === exchange.id),clock.now) === (tab === 'previous')) || [];
  return <>
    <section className="page-heading"><h1>Mis citas<span className="heading-dot">.</span></h1><p>Acuerdos privados entre los participantes. Ninguna cita genera un pago o confirma una entrega.</p></section>
    <div className="meeting-disclaimer demo-notice"><CalendarDays size={22} /><p>Primero el vendedor acepta la solicitud de intercambio. Quien propone acepta su propuesta; la otra persona debe confirmarla. Reprogramar exige una nueva aceptación. Cualquiera puede cancelar antes de la hora prevista, sin cargos. Las citas pasadas quedan solo como historial, sin marcar entregas.</p></div>
    <div className="appointments-toolbar"><div className="category-list"><button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')} aria-pressed={tab === 'pending'}>Pendientes</button><button className={tab === 'previous' ? 'active' : ''} onClick={() => setTab('previous')} aria-pressed={tab === 'previous'}>Anteriores</button></div><button className="secondary-button" onClick={refresh} disabled={busy}><RefreshCw size={16} /> Actualizar</button><button className="secondary-button" onClick={() => navigate('meeting-points')}>Ver mapa de lugares</button></div>
    {exchangeId && <button className="back-button" onClick={() => navigate('appointments')}>Ver todas mis citas</button>}{error && <p className="field-error" role="alert">{error}</p>}{message && <p className="success-message" role="status">{message}</p>}
    {!data && !error && <p role="status">Cargando citas privadas…</p>}
    {data && !visible.length && <EmptyState title={tab === 'previous' ? 'Todavía no hay citas anteriores' : 'Sin citas pendientes'} description="Para comenzar, abre un artículo de otra cuenta y solicita un intercambio. El vendedor lo verá aquí." action="Explorar artículos" onAction={() => navigate('home')} />}
    <div className="appointment-list">{visible.map((exchange) => {
      const appointment = data.appointments.find((entry) => entry.exchange_id === exchange.id);
      const place = data.places.find((entry) => entry.id === appointment?.place_id);
      const previous = isPrevious(exchange,appointment,clock.now);
      const canRespond = appointment?.status === 'proposed' && appointment.proposed_by !== user.id;
      const events = data.events.filter((event) => event.exchange_id === exchange.id);
      return <article key={exchange.id} className="appointment-card"><div className="section-heading"><div><span className="neutral-badge">{user.id === exchange.seller_id ? 'Eres el vendedor' : 'Eres el comprador'}</span><h2>{exchange.product_title}</h2></div><span className={`appointment-status ${appointment?.status === 'confirmed' ? 'confirmed' : ''}`}>{previous && appointment?.status !== 'cancelled' && new Date(appointment?.starts_at).getTime() <= clock.now ? 'Fecha anterior · sin entrega verificada' : meetingStatus[appointment?.status || exchange.status]}</span></div>
      {['pending','accepted'].includes(exchange.status) && <button className="secondary-button" disabled={busy} onClick={() => run(async () => { const id = await chat.open(exchange.id); navigate(`messages/${id}`); },'')}>Abrir chat del intercambio</button>}
      {exchange.status === 'pending' && <><p>La solicitud no es una compra ni una reserva. El vendedor debe aceptarla antes de acordar una cita.</p><div className="place-actions">{user.id === exchange.seller_id ? <><button className="primary-button" disabled={busy} onClick={() => run(() => respondExchange(exchange.id,'accept'),'Solicitud aceptada. Ya pueden proponer una cita.')}>Aceptar intercambio</button><button className="secondary-button" disabled={busy} onClick={() => run(() => respondExchange(exchange.id,'reject'),'Solicitud rechazada.')}>Rechazar</button></> : <button className="secondary-button" disabled={busy} onClick={() => run(() => respondExchange(exchange.id,'cancel'),'Solicitud cancelada.')}>Cancelar solicitud</button>}</div></>}
      {appointment && <div className="appointment-details"><h3>{place?.name || 'Lugar no disponible'}</h3><p>{place?.address}</p><strong>{formatMeetingTime(appointment.starts_at)} · Querétaro</strong><p>Propuesta por {appointment.proposed_by === user.id ? 'ti' : 'la otra persona'} · Revisión {appointment.revision}</p>{place && <a className="secondary-button" href={googleMapsUrl(place)} target="_blank" rel="noopener noreferrer">Ver en Google Maps <ExternalLink size={15} /></a>}</div>}
      {!previous && exchange.status === 'accepted' && <><div className="place-actions">{canRespond && <><button className="primary-button" disabled={busy} onClick={() => run(() => changeAppointment(exchange.id,'accept',appointment.revision),'Cita confirmada por ambas partes.')}>Aceptar lugar y hora</button><button className="secondary-button" disabled={busy} onClick={() => run(() => changeAppointment(exchange.id,'reject',appointment.revision),'Propuesta rechazada. Pueden proponer otra fecha o lugar.')}>Rechazar propuesta</button></>}{appointment && <><button className="secondary-button" onClick={() => setEditing(editing === exchange.id ? null : exchange.id)} disabled={busy}>{editing === exchange.id ? 'Cerrar formulario' : 'Reprogramar'}</button><button className="text-button delete-button" disabled={busy} onClick={() => { if (window.confirm('¿Cancelar esta cita? No genera cargos. Para intentarlo de nuevo deberán iniciar otra solicitud.')) run(() => changeAppointment(exchange.id,'cancel',appointment.revision),'Cita cancelada. No se realizó ningún movimiento de dinero.'); }}>Cancelar cita</button></>}</div>{(!appointment || editing === exchange.id) && <ProposalForm key={`${exchange.id}-${appointment?.revision || 0}-${selectedPlace || ''}`} places={data.places} selectedPlace={selectedPlace} exchange={exchange} appointment={appointment} busy={busy} onPropose={propose} />}</>}
      {events.length > 0 && <details className="appointment-history"><summary>Historial privado de propuestas</summary>{events.map((event) => <p key={event.id}><strong>{appointmentActions[event.action]}</strong> · {event.actor_id === user.id ? 'Tú' : 'La otra persona'} · {formatMeetingTime(event.created_at)}<br />{data.places.find((entry) => entry.id === event.place_id)?.name} · {formatMeetingTime(event.starts_at)}</p>)}</details>}
      </article>;
    })}</div>
  </>;
}
