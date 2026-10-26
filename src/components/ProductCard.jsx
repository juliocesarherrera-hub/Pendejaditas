import { ArrowUpRight, Clock3, Gavel, Heart, MapPin, MessageCircle, Tag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { money, saleTypes } from '../data/products';
import {auctionStatus,remainingTime,serverNow} from '../utils/auction-time';
export function ProductImage({ src, title, ...props }) {
  const [failedSource, setFailedSource] = useState(null);
  return failedSource === src || !src ? <div className="image-fallback" role="img" aria-label={`Fotografía no disponible: ${title}`}><Tag size={32} /><span>Fotografía no disponible</span></div> : <img src={src} alt={title} onError={() => setFailedSource(src)} decoding="async" {...props} />;
}
export function Countdown({ endsAt, clock, status, startsAt }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, []);
  void now;
  const label=!['active','scheduled'].includes(status)?auctionStatus[status]||'Consulta el detalle':remainingTime(status==='scheduled'?Date.parse(startsAt):endsAt,serverNow(clock));
  return <span className="countdown"><Clock3 size={13} />{status==='scheduled'?'Inicia en ':''}{label}</span>;
}
export function SaleBadge({ type }) {
  const Icon = type === 'auction' ? Gavel : type === 'offers' ? MessageCircle : Tag;
  // Sale modes are domain values, not Tailwind utilities (`fixed` positions
  // an element relative to the viewport and detaches it while scrolling).
  return <span className={`sale-badge sale-badge--${type}`}><Icon size={12} />{saleTypes[type]}</span>;
}
export function ProductCard({ product, favorites, toggleFavorite, openProduct, previewMode = false }) {
  const saved = favorites.includes(product.id);
  return <article className="product-card">
    <div className="product-photo">{previewMode ? <ProductImage src={product.image} title={product.title} /> : <button className="image-link" onClick={() => openProduct(product.id)} aria-label={`Ver ${product.title}`}><ProductImage src={product.image} title={product.title} loading="lazy" /></button>}{!previewMode && <button className={`save-button ${saved ? 'saved' : ''}`} onClick={() => toggleFavorite(product.id)} aria-label={`${saved ? 'Quitar de' : 'Añadir a'} guardados: ${product.title}`} aria-pressed={saved}><Heart size={18} fill={saved ? 'currentColor' : 'none'} /></button>}{product.type === 'auction' && !previewMode && <Countdown endsAt={product.endsAt} clock={product.clock} status={product.auction?.status} startsAt={product.auction?.starts_at} />}</div>
    <div className="product-info"><div className="product-meta"><span className="condition">{product.condition}</span><SaleBadge type={product.type} /></div>{previewMode ? <h3 className="product-title">{product.title}</h3> : <button className="product-title" onClick={() => openProduct(product.id)}>{product.title}</button>}<div className="price-row"><strong>{money(product.price)} <small>MXN</small></strong><ArrowUpRight size={17} /></div><div className="product-location"><MapPin size={12} /> {product.area}, Qro.<span>{product.type==='auction'?(product.auction?.bid_count?'Puja actual':'Precio inicial'):product.type === 'offers' ? 'Ofertas pendientes' : 'Precio fijo'}</span></div></div>
  </article>;
}
