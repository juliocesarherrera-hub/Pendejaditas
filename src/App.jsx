import { lazy, Suspense, useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { ProductPage } from './pages/ProductPage';
import { PublishPage } from './pages/PublishPage';
import { ProfilePage } from './pages/ProfilePage';
import { AuthPage } from './pages/AuthPage';
import { EmptyState } from './components/EmptyState';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useAuth } from './hooks/useAuth';
import { useMarketplace } from './hooks/useMarketplace';
import { useChatInbox } from './hooks/useChatInbox';
import {useAuctionNotifications} from './hooks/useAuctionNotifications';
import {NotificationsPage} from './pages/NotificationsPage';
import { pageTitles, parseRoute, productRoute } from './utils/navigation';

const MeetingPointsPage = lazy(() => import('./pages/MeetingPointsPage').then((module) => ({default:module.MeetingPointsPage})));
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage').then((module) => ({default:module.AppointmentsPage})));
const MessagesPage = lazy(() => import('./pages/MessagesPage').then((module) => ({default:module.MessagesPage})));

function initialRoute() {
  return new URLSearchParams(window.location.search).get('flow') === 'recovery' ? { page: 'auth', id: 'reset' } : parseRoute(window.location.hash);
}
export default function App() {
  const [route, setRoute] = useState(initialRoute);
  const auth = useAuth();
  const inbox = useChatInbox(auth.user?.id);
  const auctionNotifications=useAuctionNotifications(auth.user?.id);
  const catalog = useMarketplace();
  const [notice, setNotice] = useState('');
  const [selectedPlace, setSelectedPlace] = useState(null);
  // Favorites remain device-local; publications never read from localStorage.
  const [favorites, setFavorites, favoritesWarning] = useLocalStorage('pendejaditas:favorites:v1', [], Array.isArray);
  const navigate = (page) => { window.location.hash = page; };
  const openProduct = (id) => navigate(productRoute(id));
  const toggleFavorite = (id) => setFavorites((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  useEffect(() => {
    const onRoute = () => { setRoute(parseRoute(window.location.hash)); setNotice(''); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onRoute);
    return () => window.removeEventListener('hashchange', onRoute);
  }, []);
  useEffect(() => {
    document.title = `${pageTitles[route.page]} | pendejaditas.`;
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [route.page, route.id]);
  const selected = catalog.products.find((product) => product.id === route.id);
  const shared = { favorites, toggleFavorite, openProduct, navigate };
  const loginPrompt = <EmptyState title="Tu cuenta abre la siguiente partida" description="Inicia sesión para publicar y administrar tus artículos." action="Iniciar sesión o registrarme" onAction={() => navigate('auth/login')} />;
  let content;
  if (route.page === 'auth') content = <AuthPage key={route.id} mode={['register','recover','reset'].includes(route.id) ? route.id : 'login'} user={auth.user} navigate={navigate} />;
  else if(route.page==='notifications')content=auth.loading?<p role="status">Recuperando sesión…</p>:!auth.user?loginPrompt:<NotificationsPage key={auth.user.id} notifications={auctionNotifications} navigate={navigate}/>;
  else if (route.page === 'messages') content = auth.loading ? <p role="status">Recuperando sesión…</p> : !auth.user ? loginPrompt : <MessagesPage key={auth.user.id} user={auth.user} id={route.id} navigate={navigate} inbox={inbox} />;
  else if (route.page === 'meeting-points') content = <MeetingPointsPage selectedPlace={selectedPlace} onSelect={setSelectedPlace} navigate={navigate} user={auth.user} />;
  else if (route.page === 'appointments') content = auth.loading ? <p role="status">Recuperando sesión…</p> : !auth.user ? loginPrompt : <AppointmentsPage key={auth.user.id} user={auth.user} navigate={navigate} selectedPlace={selectedPlace} exchangeId={route.id} />;
  else if (route.page === 'profile' || route.page === 'seller') content = auth.loading ? <p role="status">Recuperando tu sesión…</p> : route.page === 'profile' && !auth.user ? loginPrompt : <ProfilePage key={route.id || auth.user?.id} user={auth.user} profileId={route.page === 'seller' ? route.id : auth.user?.id} products={catalog.products} favoritesCount={catalog.products.filter((p) => favorites.includes(p.id)).length} onChange={catalog.refresh} onNotice={setNotice} {...shared} />;
  else if (route.page === 'publish' || route.page === 'edit') content = auth.loading ? <p role="status">Recuperando tu sesión…</p> : !auth.user ? loginPrompt : !catalog.ready ? <p role="status">Configura o reconecta la base de datos para publicar.</p> : route.page === 'edit' && (!selected || selected.ownerId !== auth.user.id || selected.auction) ? <EmptyState title="No puedes editar esta publicación" description="Solo puedes modificar artículos propios que no estén vinculados a una subasta. Sus reglas y contenido quedan fijos." action="Ir a mi perfil" onAction={() => navigate('profile')} /> : <PublishPage key={selected?.id || 'new'} existing={route.page === 'edit' ? selected : null} onPublish={async ({ product, cleanupWarning }) => { await catalog.refresh(); navigate(productRoute(product.id)); if (cleanupWarning) setNotice('Publicación guardada. La fotografía anterior quedó pendiente de limpieza en Storage.'); }} />;
  else if (route.page === 'product') content = catalog.loading ? <p role="status">Cargando artículo…</p> : <ProductPage product={selected} user={auth.user} {...shared} />;
  else content = <HomePage key={route.page} products={catalog.products} loading={catalog.loading} connected={catalog.ready} mode={route.page === 'saved' ? 'saved' : route.page === 'auctions' ? 'auctions' : 'home'} {...shared} />;
  return <Layout page={route.page} user={auth.user} connected={catalog.ready} navigate={navigate} unread={inbox.unread} favoritesCount={catalog.products.filter((p) => favorites.includes(p.id)).length}>
    {auth.user&&<div className="auction-notification-link"><a href="#notifications">Avisos de subastas {auctionNotifications.unread>0&&<span className="chat-unread">{auctionNotifications.unread} sin leer</span>}</a></div>}
    {inbox.notification && route.page !== 'messages' && <div className="chat-notification" role="status"><button className="text-button" onClick={() => { navigate(`messages/${inbox.notification.id}`); inbox.dismiss(); }}>Nuevo mensaje de {inbox.notification.name} · Abrir conversación</button><button className="text-button" onClick={inbox.dismiss} aria-label="Ocultar notificación">Cerrar</button></div>}
    {catalog.error && <div className="storage-warning" role="alert"><div><p>{catalog.error}</p><button className="text-button" onClick={catalog.refresh}>Reintentar conexión</button></div></div>}
    {auth.error && <p className="field-error" role="alert">{auth.error}</p>}
    {favoritesWarning && <p className="storage-warning" role="status">No se pudieron guardar tus favoritos en este dispositivo.</p>}
    {notice && <p className="success-message" role="status">{notice}</p>}
    <Suspense fallback={<p role="status">Cargando sección…</p>}>{content}</Suspense>
  </Layout>;
}
