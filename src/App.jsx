import { useEffect, useState } from 'react';
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
import { pageTitles, parseRoute, productRoute } from './utils/navigation';

function initialRoute() {
  return new URLSearchParams(window.location.search).get('flow') === 'recovery' ? { page: 'auth', id: 'reset' } : parseRoute(window.location.hash);
}
export default function App() {
  const [route, setRoute] = useState(initialRoute);
  const auth = useAuth();
  const catalog = useMarketplace();
  const [notice, setNotice] = useState('');
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
  else if (route.page === 'profile' || route.page === 'seller') content = auth.loading ? <p role="status">Recuperando tu sesión…</p> : route.page === 'profile' && !auth.user ? loginPrompt : <ProfilePage key={route.id || auth.user?.id} user={auth.user} profileId={route.page === 'seller' ? route.id : auth.user?.id} products={catalog.products} favoritesCount={catalog.products.filter((p) => favorites.includes(p.id)).length} onChange={catalog.refresh} onNotice={setNotice} {...shared} />;
  else if (route.page === 'publish' || route.page === 'edit') content = auth.loading ? <p role="status">Recuperando tu sesión…</p> : !auth.user ? loginPrompt : !catalog.ready ? <p role="status">Configura o reconecta la base de datos para publicar.</p> : route.page === 'edit' && (!selected || selected.ownerId !== auth.user.id) ? <EmptyState title="No puedes editar esta publicación" description="Solo puedes modificar artículos de tu cuenta." action="Ir a mi perfil" onAction={() => navigate('profile')} /> : <PublishPage key={selected?.id || 'new'} existing={route.page === 'edit' ? selected : null} onPublish={async ({ product, cleanupWarning }) => { await catalog.refresh(); navigate(productRoute(product.id)); if (cleanupWarning) setNotice('Publicación guardada. La fotografía anterior quedó pendiente de limpieza en Storage.'); }} />;
  else if (route.page === 'product') content = catalog.loading ? <p role="status">Cargando artículo…</p> : <ProductPage product={selected} user={auth.user} {...shared} />;
  else content = <HomePage key={route.page} products={catalog.products} loading={catalog.loading} connected={catalog.ready} mode={route.page === 'saved' ? 'saved' : route.page === 'auctions' ? 'auctions' : 'home'} {...shared} />;
  return <Layout page={route.page} user={auth.user} connected={catalog.ready} navigate={navigate} favoritesCount={catalog.products.filter((p) => favorites.includes(p.id)).length}>
    {catalog.error && <div className="storage-warning" role="alert"><div><p>{catalog.error}</p><button className="text-button" onClick={catalog.refresh}>Reintentar conexión</button></div></div>}
    {auth.error && <p className="field-error" role="alert">{auth.error}</p>}
    {favoritesWarning && <p className="storage-warning" role="status">No se pudieron guardar tus favoritos en este dispositivo.</p>}
    {notice && <p className="success-message" role="status">{notice}</p>}
    {content}
  </Layout>;
}
