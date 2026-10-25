// Researched public directory, not user locations or officially certified safe sites.
export const meetingPlaces = [
  { id: 'antea', name: 'Antea Lifestyle Center', address: 'Carretera San Luis Potosí–Querétaro 12401, El Salitre, C.P. 76127, Santiago de Querétaro, Querétaro, México', zone: 'El Salitre', latitude: 20.6742, longitude: -100.4362, source_url: 'https://antea.mx/contactanos/', coordinates_source_url: 'https://en.wikipedia.org/wiki/Antea_LifeStyle_Center', verified_on: '2026-10-24' },
  { id: 'puerta-victoria', name: 'Plaza Puerta La Victoria', address: 'Av. Constituyentes 40, Col. Villas del Sol, Querétaro, Querétaro, México', zone: 'Villas del Sol', latitude: 20.585053332988743, longitude: -100.38230644651445, source_url: 'https://puertalavictoria.mx/contacto/', coordinates_source_url: 'https://puertalavictoria.mx/contacto/', verified_on: '2026-10-24' },
];
export function googleMapsUrl(place) {
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', `${place.name}, ${place.address}`);
  return url.href;
}
