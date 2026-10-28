import { ArrowUpRight, Compass, Gavel, Heart, MapPin, Plus, ShieldCheck, UserRound } from 'lucide-react';
const links = [{ id: 'home', label: 'Explorar', icon: Compass }, { id: 'auctions', label: 'Subastas', icon: Gavel }, { id: 'saved', label: 'Guardados', icon: Heart }, { id: 'profile', label: 'Mi perfil', icon: UserRound }];
export function Layout({ children, page, navigate, favoritesCount, user, connected, unread = 0 }) {
  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Saltar al contenido</a>
    <div className="demo-bar"><span>{connected ? 'Catálogo conectado a Supabase.' : 'Catálogo sin conexión confirmada.'}</span> Pagos digitales y transferencias deshabilitados. <span className="demo-phase">Funciones en desarrollo <ArrowUpRight size={12} /></span></div>
    <header className="site-header"><div className="header-inner">
      <a className="wordmark" href="#home" aria-label="Pendejaditas, inicio">pendejaditas<span>.</span></a>
      <span className="location"><MapPin size={15} /> Querétaro, MX</span>
      <nav className="desktop-nav" aria-label="Navegación principal">{links.slice(0, 3).map(({ id, label }) => <a key={id} className={page === id ? 'active' : ''} href={`#${id}`} aria-current={page === id ? 'page' : undefined}>{label}{id === 'saved' && favoritesCount > 0 && <span className="count">{favoritesCount}</span>}</a>)}</nav>
      <div className="header-actions"><button className="primary-button publish-button" onClick={() => navigate('publish')}><Plus size={18} /> Publicar artículo</button><button className={`avatar ${user && page === 'profile' ? 'selected' : ''}`} onClick={() => navigate('profile')} aria-label="Abrir mi perfil"><UserRound size={20} /></button></div>
    </div></header>
    <nav className="meeting-navigation" aria-label="Intercambios"><a href="#meeting-points" aria-current={page === 'meeting-points' ? 'page' : undefined}><MapPin size={17} /> Puntos de encuentro</a><a href="#appointments" aria-current={page === 'appointments' ? 'page' : undefined}>Mis citas</a><a href="#messages" aria-current={page === 'messages' ? 'page' : undefined}>Mensajes {unread > 0 && <span className="chat-unread" aria-label={`${unread} mensajes no leídos`}>{unread > 99 ? '99+' : unread}</span>}</a></nav>
    {user&&<nav className="meeting-navigation" aria-label="Ayuda en intercambios"><a href="#claims" aria-current={page==='claims'?'page':undefined}>Mis reclamaciones</a></nav>}
    <main className="main-container" id="main-content" tabIndex={-1}>{children}</main>
    <footer className="site-footer"><span className="wordmark small">pendejaditas<span>.</span></span><p>Una nueva vida para eso que te gusta.</p><span><ShieldCheck size={15} /> Hecho para Querétaro · Funciones en desarrollo</span></footer>
    <nav className="bottom-nav" aria-label="Navegación móvil">{[...links.slice(0, 2), { id: 'publish', label: 'Publicar', icon: Plus }, ...links.slice(2)].map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} aria-current={page === id ? 'page' : undefined} className={`${page === id ? 'active' : ''} ${id === 'publish' ? 'nav-publish' : ''}`}><Icon size={21} aria-hidden="true" /><span>{label}</span></a>)}</nav>
  </div>;
}
