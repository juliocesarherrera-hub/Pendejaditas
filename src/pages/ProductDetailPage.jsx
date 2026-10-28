import { EmptyState } from '../components/EmptyState';
import { useProductDetail } from '../hooks/useProductDetail';
import { ProductPage } from './ProductPage';

export function ProductDetailState({ state, user, navigate, ...shared }) {
  if (state.status === 'ready') return <ProductPage key={state.product.id} product={state.product} user={user} navigate={navigate} {...shared} />;
  if (state.status === 'loading') return <section className="empty-state" role="status" aria-busy="true"><p>Consultando publicación…</p></section>;
  const messages = {
    invalid: ['Enlace de publicación no válido', 'Revisa el enlace o busca el artículo en el catálogo.'],
    not_found: ['Publicación no disponible', 'No encontramos una publicación visible con este enlace. Puede no existir o no estar disponible para tu sesión.'],
    restricted: ['Acceso restringido', 'No se pudo autorizar esta consulta. Comprueba tu sesión y vuelve a intentarlo.'],
    error: state.reason === 'connection'
      ? ['No se pudo conectar', 'La consulta no se completó. Comprueba tu conexión a Internet y vuelve a intentarlo.']
      : ['No pudimos consultar la publicación', 'El servicio no pudo completar la consulta. Inténtalo de nuevo más tarde.'],
  };
  const [title, description] = messages[state.status] || messages.error;
  const retry = state.status === 'error' || state.status === 'restricted';
  return <section role={retry ? 'alert' : 'status'}>
    <EmptyState title={title} description={description} action={retry ? 'Reintentar consulta' : 'Volver al catálogo'} onAction={retry ? () => { void state.refresh(); } : () => navigate('home')} />
    {retry && <a className="text-button" href="#home">Volver al catálogo</a>}
    {state.status === 'restricted' && !user && <button className="text-button" onClick={() => navigate('auth/login')}>Iniciar sesión</button>}
  </section>;
}

export function ProductDetailPage({ id, ...props }) {
  const state = useProductDetail(id);
  return <ProductDetailState state={state} {...props} />;
}
