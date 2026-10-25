import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
export function MeetingMap({ places, selectedId, onSelect }) {
  const host = useRef(null), instance = useRef(null), library = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let resize;
    import('leaflet').then((module) => {
      if (!active || !host.current) return;
      const L = module.default;
      library.current = L;
      const map = L.map(host.current, { scrollWheelZoom: false }).setView([20.625,-100.405], 12);
      instance.current = map;
      L.tileLayer(import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).on('tileerror', () => { if (active) setError('No se pudieron cargar algunas partes del mapa. Puedes seguir usando la lista y Google Maps.'); }).addTo(map);
      resize = new ResizeObserver(() => map.invalidateSize()); resize.observe(host.current);
      setReady(true);
    }).catch(() => { if (active) setError('El mapa no pudo cargarse. Utiliza la lista de lugares.'); });
    return () => { active = false; resize?.disconnect(); instance.current?.remove(); instance.current = null; };
  }, []);
  useEffect(() => {
    if (!ready || !instance.current) return;
    const L = library.current, map = instance.current;
    const markers = places.map((place, index) => {
      const node = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = place.name;
      const address = document.createElement('p'); address.textContent = place.address;
      node.append(title,address);
      const marker = L.marker([place.latitude,place.longitude], { title: place.name, alt: `Seleccionar ${place.name}`, icon: L.divIcon({ className: `meeting-pin ${selectedId === place.id ? 'selected' : ''}`, html: String(index + 1), iconSize: [44,44] }) }).bindPopup(node).on('click', () => onSelect(place.id)).addTo(map);
      if (place.id === selectedId) marker.openPopup();
      return marker;
    });
    if (places.length && !places.some((place) => place.id === selectedId)) map.fitBounds(places.map((place) => [place.latitude,place.longitude]), { padding: [35,35], maxZoom: 15 });
    if (selectedId) { const place = places.find((entry) => entry.id === selectedId); if (place) map.panTo([place.latitude,place.longitude]); }
    return () => markers.forEach((marker) => marker.remove());
  }, [places, ready, selectedId, onSelect]);
  return <div><div ref={host} className="meeting-map" role="region" aria-label="Mapa interactivo de lugares públicos en Querétaro" />{!ready && !error && <p role="status">Cargando mapa…</p>}{error && <p className="field-error" role="status">{error}</p>}<p className="map-note">Solo se muestran establecimientos. No se solicita tu ubicación. Marcadores de referencia; acuerden la entrada exacta.</p></div>;
}
