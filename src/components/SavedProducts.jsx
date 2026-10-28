import { usePublicCollection } from '../hooks/usePublicCollection';
import { favoriteReferences } from '../lib/public-collections';
import { CollectionFeedback } from './CollectionFeedback';
import { EmptyState } from './EmptyState';

export function SavedProducts({ favorites = [], toggleFavorite, navigate, children }) {
  const state = usePublicCollection({ kind: 'favorites', favorites });
  const refs = favoriteReferences(favorites);
  const notice = <>
    <p className="field-hint">Guardados en este dispositivo, del más reciente al más antiguo. Los filtros y el orden por precio se aplican a las publicaciones consultadas.</p>
    {refs.legacyCount > 0 && <p role="status">Hay {refs.legacyCount} referencias antiguas que no se pueden consultar. Se conservan en este dispositivo.</p>}
    {state.unavailable > 0 && <p role="status">{state.unavailable} guardados consultados no están disponibles para tu sesión. Se conservan y no se consideran eliminados automáticamente.</p>}
  </>;
  const empty = state.status === 'ready' ? <EmptyState title={refs.ids.length || refs.legacyCount ? 'No hay publicaciones visibles en este grupo' : 'Aquí empieza tu lista de deseos'} description={state.hasMore ? 'Puedes consultar los siguientes guardados. Los que no estén disponibles se conservan en tu dispositivo.' : 'Guarda artículos desde el catálogo. Las referencias antiguas o no disponibles no se borran automáticamente.'} action="Explorar artículos" onAction={() => navigate('home')} /> : <p role="status">La lista no pudo consultarse todavía.</p>;
  return children({ products: state.items, favorites: refs.ids, toggleFavorite, loading: state.status === 'loading', connected: true,
    beforeResults: notice, emptyState: empty, afterResults: <CollectionFeedback state={state} moreLabel="Consultar siguientes guardados" /> });
}
