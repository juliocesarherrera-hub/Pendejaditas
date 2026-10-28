import { useState } from 'react';
import { ArrowRight, Heart, LogOut, MapPin, Package, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { EmptyState } from '../components/EmptyState';
import { supabase } from '../lib/supabase';
import { deleteProduct, serviceError } from '../lib/marketplace';
import { validateProfile } from '../lib/validation';
import { usePublicCollection } from '../hooks/usePublicCollection';
import { favoriteReferences } from '../lib/public-collections';
import { CollectionFeedback } from '../components/CollectionFeedback';
import { PublishPage } from './PublishPage';
export function ProfilePage({ profileId, user, favorites = [], toggleFavorite, openProduct, navigate, onChange, onNotice }) {
  const collection = usePublicCollection({ kind: 'seller', sellerId: profileId, viewerId: user?.id || 'anonymous' });
  const profile = collection.profile;
  const [draft, setDraft] = useState(null);
  const draftKey = `${profileId}:${user?.id || 'anonymous'}`;
  const name = draft?.key === draftKey ? draft.name : profile?.display_name || '';
  const bio = draft?.key === draftKey ? draft.bio : profile?.bio || '';
  const setName = name => setDraft({ key: draftKey, name, bio });
  const setBio = bio => setDraft({ key: draftKey, name, bio });
  const [error, setError] = useState('');
  const loading = collection.status === 'loading';
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [editing, setEditing] = useState(null);
  const own = Boolean(user?.id && user.id === profileId?.toLowerCase());
  const listings = collection.items;
  const favoritesCount = favoriteReferences(favorites).ids.length;
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const payload = validateProfile(name, bio);
      const { data, error: failure } = await supabase.from('profiles').update(payload).eq('id', user.id).select('id,display_name,bio,city,created_at').single();
      if (failure) throw new Error(serviceError(failure));
      setDraft({ key: draftKey, name: data.display_name, bio: data.bio }); onNotice('Tu perfil se guardó en Supabase.'); await collection.refresh(); await onChange();
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  async function remove(product) {
    setBusy(true); setError('');
    try {
      const result = await deleteProduct(product);
      setConfirmId(null); await collection.refresh(); await onChange(); onNotice(result.cleanupWarning ? 'Publicación eliminada. Su fotografía quedó pendiente de limpieza en Storage.' : 'Publicación y fotografía eliminadas.');
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setError('');
    try {
      const { error: failure } = await supabase.auth.signOut({ scope: 'local' });
      if (failure) throw failure;
      navigate('home');
    } catch { setError('No se pudo cerrar sesión. Inténtalo de nuevo.'); } finally { setBusy(false); }
  }
  if (loading) return <p role="status">Cargando perfil…</p>;
  if (collection.status === 'error') return <><h1>No se pudo consultar el perfil</h1><CollectionFeedback state={collection} /><button className="text-button" onClick={() => navigate('home')}>Volver a explorar</button></>;
  if (!profile) return <EmptyState title="Perfil no disponible" description={error || 'El usuario no tiene un perfil público disponible.'} action="Volver a explorar" onAction={() => navigate('home')} />;
  if (editing && own && editing.ownerId === user.id) return <><button className="back-button" onClick={() => setEditing(null)}>Volver a mis publicaciones</button><PublishPage key={`${editing.id}-${editing.updatedAt}`} existing={editing} onPublish={async ({ cleanupWarning }) => { setEditing(null); await collection.refresh(); await onChange(); onNotice(cleanupWarning ? 'Publicación guardada. La fotografía anterior quedó pendiente de limpieza en Storage.' : 'Publicación guardada.'); }} /></>;
  return <>
    <section className="page-heading"><h1>{own ? 'Tu rincón en pendejaditas.' : profile.display_name}</h1><p>{own ? 'Una misma cuenta para comprar y vender. Sin operaciones monetarias habilitadas.' : 'Perfil público de la comunidad.'}</p></section>
    <section className="profile-header"><div className="profile-avatar">{profile.display_name.slice(0,1).toUpperCase()}</div><div><span className="neutral-badge">{own ? 'Mi cuenta' : 'Perfil público'}</span><h2>{profile.display_name}</h2><p><MapPin size={14} /> {profile.city}, México</p></div>{own && <button className="secondary-button" onClick={() => navigate('publish')}><Plus size={17} /> Publicar artículo</button>}</section>
    {profile.bio && <p className="profile-note profile-bio">{profile.bio}</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
    {own && <form className="profile-edit" onSubmit={save}><h2>Editar mi perfil público</h2><label>Nombre público<input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={60} required /></label><label>Sobre ti<textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={3} /></label><p className="field-hint">El nombre y la descripción son públicos. Tu correo no se publica.</p><button className="primary-button" disabled={busy}>{busy ? 'Guardando…' : 'Guardar perfil'}</button><button className="text-button" type="button" onClick={signOut} disabled={busy}><LogOut size={17} /> Cerrar sesión en este dispositivo</button></form>}
    <div className="profile-stats"><div><Package size={21} /><strong>{listings.length}</strong><span>Publicaciones consultadas</span></div>{own && <button onClick={() => navigate('saved')}><Heart size={21} /><strong>{favoritesCount}</strong><span>Referencias guardadas en este dispositivo <ArrowRight size={14} /></span></button>}</div>
    <section className="profile-trust"><ShieldCheck size={26} /><div><h2>La confianza se construye.</h2><p>Una cuenta registrada no equivale a identidad verificada. La protección de pagos, las reseñas y la verificación se desarrollarán después.</p></div><span className="neutral-badge">Sin verificación de identidad</span></section>
    <div className="section-heading"><h2>{own ? 'Mis publicaciones' : 'Sus publicaciones'}</h2></div>
    {listings.length ? <div className="product-grid">{listings.map((product) => <div key={product.id}><ProductCard product={product} favorites={favorites} toggleFavorite={toggleFavorite} openProduct={openProduct} />{own && !product.auction && <div className="listing-actions">{confirmId === product.id ? <div className="delete-confirm"><p>¿Eliminar esta publicación y su fotografía? No se puede deshacer.</p><button className="secondary-button" onClick={() => remove(product)} disabled={busy}>Confirmar eliminación</button><button className="text-button" onClick={() => setConfirmId(null)} disabled={busy}>Cancelar</button></div> : <><button className="text-button" onClick={() => setEditing(product)} disabled={busy}><Pencil size={15} /> Editar</button><button className="text-button delete-button" onClick={() => setConfirmId(product.id)} disabled={busy}><Trash2 size={15} /> Eliminar</button></>}</div>}</div>)}</div> : <EmptyState title="No hay publicaciones visibles" description={own ? 'Puedes publicar un artículo o volver a consultar tu perfil.' : 'No hay publicaciones disponibles para mostrar en este perfil con tu sesión actual.'} action={own ? 'Publicar artículo' : 'Explorar artículos'} onAction={() => navigate(own ? 'publish' : 'home')} />}
    <CollectionFeedback state={collection} />
  </>;
}
