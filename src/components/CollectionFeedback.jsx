const messages = {
  connection: 'No se pudo conectar. Comprueba Internet y vuelve a consultar; esto no indica que las publicaciones se hayan eliminado.',
  restricted: 'No se pudo autorizar la consulta. Revisa tu sesión y vuelve a intentarlo.',
  configuration: 'La conexión con Supabase no está configurada. No se pudo consultar esta lista.',
  service: 'No se pudo completar la consulta. Inténtalo de nuevo más tarde.',
};
export function CollectionFeedback({ state, moreLabel = 'Cargar más publicaciones' }) {
  const failure = state.status === 'error' ? state.reason : state.error;
  return <>
    {failure && <div className="field-error" role="alert"><p>{messages[failure] || messages.service}</p><button className="secondary-button" onClick={() => { void (state.status === 'error' ? state.refresh() : state.loadMore()); }}>Reintentar consulta</button></div>}
    {state.loadingMore && <p role="status">Consultando más publicaciones…</p>}
    {state.status === 'ready' && state.hasMore && <button className="secondary-button" disabled={state.loadingMore} onClick={() => { void state.loadMore(); }}>{moreLabel}</button>}
    {state.status === 'ready' && <button className="text-button" disabled={state.loadingMore} onClick={() => { void state.refresh(); }}>Volver a consultar desde el inicio</button>}
  </>;
}
