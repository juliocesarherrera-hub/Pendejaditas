export const pageTitles = {
  home: 'Explorar', auctions: 'Subastas', saved: 'Guardados',
  publish: 'Publicar artículo', profile: 'Mi perfil', seller: 'Perfil público', product: 'Detalle del artículo', auth: 'Acceso', edit: 'Editar publicación',
  'meeting-points': 'Puntos de encuentro', appointments: 'Mis citas', messages: 'Mensajes', notifications:'Avisos de subastas',deliveries:'Mis entregas',
};

export function parseRoute(hash = '') {
  const [requestedPage, encodedId] = hash.replace(/^#\/?/, '').split('/');
  const page = Object.hasOwn(pageTitles, requestedPage) ? requestedPage : 'home';
  let id;
  try { id = encodedId ? decodeURIComponent(encodedId) : undefined; }
  catch { id = undefined; }
  return { page, id };
}

export function productRoute(id) {
  return `product/${encodeURIComponent(id)}`;
}
