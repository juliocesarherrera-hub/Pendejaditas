import { ArrowLeft, Check, Heart, Info, MapPin, Pencil, ShieldCheck, UserRound } from 'lucide-react';
import { ProductImage, SaleBadge } from '../components/ProductCard';
import { EmptyState } from '../components/EmptyState';
import { money } from '../data/products';
import { useState } from 'react';
import { requestExchange } from '../lib/meetings';
import { chat } from '../lib/chat';
import {AuctionGallery} from '../components/AuctionGallery';
import {AuctionPanel} from '../components/AuctionPanel';
export function ProductPage({ product, user, favorites, toggleFavorite, navigate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function request(contact = false) {
    if (!user) { navigate('auth/login'); return; }
    setBusy(true); setError('');
    try { const exchangeId = await requestExchange(product.id); if (contact) { const id = await chat.open(exchangeId); navigate(`messages/${id}`); } else navigate(`appointments/${exchangeId}`); }
    catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  if (!product) return <EmptyState title="Este artículo no está disponible" description="La publicación pudo haberse eliminado. Actualiza el catálogo y vuelve a intentarlo." action="Volver al catálogo" onAction={() => navigate('home')} />;
  const saved = favorites.includes(product.id);
  return <>
    <button className="back-button" onClick={() => navigate('home')}><ArrowLeft size={17} /> Volver a explorar</button>
    <div className="detail-layout"><div className="detail-media"><div className={`detail-photo ${product.auction?'auction-photo-frame':''}`}>{product.auction?<AuctionGallery key={product.id} product={product}/>:<ProductImage src={product.image} title={product.title} />}</div><p className="photo-note">Fotografía publicada por el vendedor.</p><section className="description"><h2>Sobre este hallazgo</h2><p>{product.description}</p><dl><div><dt>Categoría</dt><dd>{product.category}</dd></div><div><dt>Estado</dt><dd>{product.condition}</dd></div><div><dt>Zona</dt><dd>{product.area}, Querétaro</dd></div></dl></section></div>
      <section className="detail-summary"><div className="detail-badges"><SaleBadge type={product.type} /></div><h1>{product.title}</h1><p className="detail-location"><MapPin size={16} /> {product.area}, Querétaro</p><span className="price-caption">{product.type === 'auction' ? 'Referencia del catálogo · consulta la puja actual abajo' : product.type === 'offers' ? 'Precio de referencia' : 'Precio publicado'}</span><p className="detail-price">{money(product.price)} <span>MXN</span></p><p className="condition-line"><Check size={16} /> {product.condition}</p>
      <div className="demo-action"><button className="primary-button" disabled>Compras y pagos aún no disponibles</button>{product.type === 'offers' && <button className="secondary-button" disabled>Envío de ofertas en desarrollo</button>}<button className={`secondary-button ${saved ? 'selected' : ''}`} onClick={() => toggleFavorite(product.id)} aria-pressed={saved}><Heart size={17} fill={saved ? 'currentColor' : 'none'} />{saved ? 'Guardado en este dispositivo' : 'Guardar para después'}</button>{user?.id === product.ownerId && !product.auction && <button className="secondary-button" onClick={() => navigate(`edit/${product.id}`)}><Pencil size={17} /> Editar mi publicación</button>}</div>
      {product.type==='auction' ? <AuctionPanel key={`${product.id}-${user?.id||'anon'}`} product={product} user={user} navigate={navigate}/> : user?.id !== product.ownerId && <><button className="primary-button request-exchange" onClick={() => request(true)} disabled={busy}>{busy ? 'Conectando…' : 'Contactar al vendedor'}</button><button className="secondary-button request-exchange" onClick={() => request(false)} disabled={busy}>Solicitar intercambio y acordar cita</button><p className="field-hint">Contactar crea una solicitud para coordinarse; no realiza una compra ni reserva el artículo.</p></>}{error && <p className="field-error" role="alert">{error}</p>}
      <div className="demo-notice"><Info size={19} /><p>Contactar no reserva el artículo. La cita y el QR registran acuerdos y declaraciones; no verifican un pago. Los pagos bancarios permanecen deshabilitados.</p></div>
      <button className="seller seller-link" onClick={() => navigate(`seller/${product.ownerId}`)}><span className="avatar"><UserRound size={21} /></span><span><strong>{product.seller}</strong><span className="seller-subtitle">Ver perfil público · Identidad no verificada</span></span></button>
      <div className="trust-note"><ShieldCheck size={22} /><div><h3>La confianza se construye.</h3><p>Revisa el artículo y el perfil. La plataforma todavía no ofrece protección transaccional ni verificación de identidad.</p></div></div></section></div>
  </>;
}
