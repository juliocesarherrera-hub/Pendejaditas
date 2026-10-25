import { ArrowUpRight, Clock3, Gavel, Heart, MapPin, MessageCircle, Tag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { money, saleTypes } from '../data/products';
export function ProductImage({ src, title, ...props }) {
  const [failedSource, setFailedSource] = useState(null);
  return failedSource === src || !src ? <div className="image-fallback" role="img" aria-label={`Fotografía no disponible: ${title}`}><Tag size={32} /><span>Fotografía no disponible</span></div> : <img src={src} alt={title} onError={() => setFailedSource(src)} decoding="async" {...props} />;
}
export function Countdown({ endsAt }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, []);
  const seconds = Math.max(0, Math.floor((endsAt - now) / 1000));
  if (!seconds) return <span className="countdown"><Clock3 size={13} /> Finalizada · demo</span>;
  const time = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((n) => String(n).padStart(2, '0')).join(':');
  return <span className="countdown" aria-label={`Tiempo restante de demostración: ${time}`}><Clock3 size={13} /> {time}</span>;
}
export function SaleBadge({ type }) {
  const Icon = type === 'auction' ? Gavel : type === 'offers' ? MessageCircle : Tag;
  return <span className={`sale-badge ${type}`}><Icon size={12} />{saleTypes[type]}</span>;
}
export function ProductCard({ product, favorites, toggleFavorite, openProduct, previewMode = false }) {
  const saved = favorites.includes(product.id);
  return <article className="product-card">
    <div className="product-photo">{previewMode ? <ProductImage src={product.image} title={product.title} /> : <button className="image-link" onClick={() => openProduct(product.id)} aria-label={`Ver ${product.title}`}><ProductImage src={product.image} title={product.title} loading="lazy" /></button>}{!previewMode && <button className={`save-button ${saved ? 'saved' : ''}`} onClick={() => toggleFavorite(product.id)} aria-label={`${saved ? 'Quitar de' : 'Añadir a'} guardados: ${product.title}`} aria-pressed={saved}><Heart size={18} fill={saved ? 'currentColor' : 'none'} /></button>}{product.type === 'auction' && <Countdown endsAt={product.endsAt} />}</div>
    <div className="product-info"><div className="product-meta"><span className="condition">{product.condition}</span><SaleBadge type={product.type} /></div>{previewMode ? <h3 className="product-title">{product.title}</h3> : <button className="product-title" onClick={() => openProduct(product.id)}>{product.title}</button>}<div className="price-row"><strong>{money(product.price)} <small>MXN</small></strong><ArrowUpRight size={17} /></div><div className="product-location"><MapPin size={12} /> {product.area}, Qro.<span>{product.type === 'offers' ? 'Ofertas pendientes' : 'Precio fijo'}</span></div></div>
  </article>;
}
