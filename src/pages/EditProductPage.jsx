import { useEditableProduct } from '../hooks/useEditableProduct';
import { EmptyState } from '../components/EmptyState';
import { PublishPage } from './PublishPage';

export function EditProductState({ state, user, navigate, onPublish }) {
  if (state.status === 'loading') return <section className="empty-state" role="status" aria-busy="true"><p>Consultando publicación para editar…</p></section>;
  if (state.status === 'ready' && state.product.ownerId === user?.id?.toLowerCase() && state.product.type !== 'auction') return <PublishPage key={`${user.id}-${state.product.id}`} existing={state.product} onPublish={onPublish} />;
  const messages = {
    invalid: ['Enlace no válido', 'Revisa el identificador de la publicación.'],
    unavailable: ['Publicación no disponible para editar', 'No encontramos una publicación propia visible con este enlace.'],
    restricted: ['No puedes editar esta publicación', 'Revisa tu sesión. Solo puedes editar tus propias publicaciones y el servidor conserva las restricciones aplicables.'],
    blocked: ['Esta subasta no se puede editar', 'Su publicación y sus reglas se conservan. Consulta su detalle para revisar las opciones disponibles.'],
    error: ['No se pudo consultar la publicación', state.reason === 'connection' ? 'Comprueba Internet y vuelve a intentarlo. Esto no indica que la publicación haya sido eliminada.' : 'El servicio no pudo completar la consulta. Inténtalo nuevamente.'],
  };
  const [title, description] = messages[state.status] || messages.restricted;
  const retry = ['error', 'restricted'].includes(state.status);
  return <section role={retry ? 'alert' : 'status'}><EmptyState title={title} description={description} action={retry ? 'Reintentar consulta' : 'Ir a mi perfil'} onAction={retry ? () => { void state.refresh(); } : () => navigate('profile')} /></section>;
}
export function EditProductPage({ id, user, ...props }) {
  const state = useEditableProduct(id, user?.id);
  return <EditProductState state={state} user={user} {...props} />;
}
