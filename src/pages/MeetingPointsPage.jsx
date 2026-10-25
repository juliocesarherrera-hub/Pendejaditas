import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, MapPin } from 'lucide-react';
import { googleMapsUrl } from '../data/meetingPlaces';
import { fetchMeetingPlaces } from '../lib/meetings';
import { MeetingMap } from '../components/MeetingMap';
export function MeetingPointsPage({ selectedPlace, onSelect, navigate, user }) {
  const [zone, setZone] = useState('Todas');
  const [query, setQuery] = useState('');
  const [previewId, setPreviewId] = useState(selectedPlace || null);
  const [directory,setDirectory] = useState([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [attempt,setAttempt] = useState(0);
  useEffect(() => {
    let active=true;
    fetchMeetingPlaces().then((rows) => { if(active) {setDirectory(rows);setError('');} }).catch((failure) => {if(active) setError(failure.message);}).finally(() => {if(active)setLoading(false);});
    return () => {active=false;};
  },[attempt]);
  const selectPreview = useCallback((id) => setPreviewId(id), []);
  const places = directory.filter((place) => (zone === 'Todas' || zone === place.zone) && `${place.name} ${place.address}`.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')));
  return <>
    <section className="page-heading"><h1>Puntos de encuentro<span className="heading-dot">.</span></h1><p>Lugares públicos sugeridos en Querétaro. Seleccionen un establecimiento y acuerden los detalles entre ambas partes.</p></section>
    <div className="demo-notice meeting-disclaimer"><MapPin size={22} /><p>Estos lugares no son puntos seguros oficiales ni tienen autorización de intercambio verificada por Pendejaditas. Revisa horarios y reglas del establecimiento antes de asistir. La selección no crea una cita por sí sola.</p></div>
    {loading && <p role="status">Cargando lugares desde Supabase…</p>}{error && <div role="alert"><p className="field-error">{error}</p><button className="secondary-button" onClick={() => {setLoading(true);setAttempt((current)=>current+1);}}>Reintentar</button></div>}
    <div className="meeting-filters"><label>Buscar establecimiento<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o dirección" /></label><label>Zona<select value={zone} onChange={(event) => setZone(event.target.value)}>{['Todas', ...new Set(directory.map((place) => place.zone))].map((name) => <option key={name}>{name}</option>)}</select></label></div>
    <div className="meeting-points-layout"><MeetingMap places={places} selectedId={previewId} onSelect={selectPreview} /><div className="place-list">{!loading && !error && !places.length && <p role="status">No hay establecimientos con esos filtros.</p>}{places.map((place) => <article key={place.id} className={`place-card ${previewId === place.id ? 'selected' : ''}`}><span className="neutral-badge">{place.zone}</span><h2>{place.name}</h2><p>{place.address}</p><div className="place-actions"><a className="secondary-button" href={googleMapsUrl(place)} target="_blank" rel="noopener noreferrer">Ver en Google Maps <ExternalLink size={15} /></a><button className="primary-button" onClick={() => { setPreviewId(place.id); onSelect(place.id); }}><Check size={16} />{selectedPlace === place.id ? 'Punto seleccionado' : 'Seleccionar punto de encuentro'}</button></div><a className="text-button" href={place.source_url} target="_blank" rel="noopener noreferrer">Consultar dirección en sitio oficial <ExternalLink size={13} /></a></article>)}</div></div>
    {directory.some((place)=>place.id===selectedPlace) && <div className="community-banner"><p>Punto seleccionado para tu próxima propuesta. La otra persona deberá aceptarlo.</p><button className="secondary-button" onClick={() => navigate(user ? 'appointments' : 'auth/login')}>{user ? 'Ir a mis citas' : 'Iniciar sesión'}</button></div>}
  </>;
}
