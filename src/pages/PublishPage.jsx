import { useRef, useState } from 'react';
import { ArrowRight, Camera, Check, Gavel, ImagePlus, Info, MessageCircle, Tag, X } from 'lucide-react';
import { categories } from '../data/products';
import { ProductCard } from '../components/ProductCard';
import { saveProduct } from '../lib/marketplace';

const modes = [{ id: 'fixed', label: 'Precio fijo', text: 'Tú pones el precio.', icon: Tag }, { id: 'offers', label: 'Precio negociable', text: 'Ofertas en desarrollo.', icon: MessageCircle }, { id: 'auction', label: 'Subasta', text: 'En desarrollo.', icon: Gavel }];
export function PublishPage({ onPublish, existing = null }) {
  const [form, setForm] = useState({ title: existing?.title || '', description: existing?.description || '', category: existing?.category || 'Consolas', condition: existing?.condition || 'Como nuevo', type: existing?.type || 'fixed', price: existing?.price || '', area: existing?.area || 'Centro', duration: '24' });
  const [image, setImage] = useState(existing?.image || '');
  const [file, setFile] = useState(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [previewStart] = useState(Date.now);
  const fileInput = useRef(null);
  const update = (e) => setForm((current) => ({ ...current, [e.target.name]: e.target.value }));
  const preview = { ...form, id: 'preview', image, price: Number(form.price) || 0, title: form.title || 'Aquí va tu próximo hallazgo', endsAt: previewStart + Number(form.duration) * 3600000 };
  function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setError('Elige una imagen JPG, PNG o WebP de hasta 2 MB.'); e.target.value = ''; return; }
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const source = String(reader.result);
      const picture = new Image();
      picture.onload = () => {
        try {
          if (picture.naturalWidth * picture.naturalHeight > 40000000) throw new Error('Imagen demasiado grande.');
          const ratio = Math.min(1, 1600 / Math.max(picture.naturalWidth, picture.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(picture.naturalWidth * ratio));
          canvas.height = Math.max(1, Math.round(picture.naturalHeight * ratio));
          canvas.getContext('2d').drawImage(picture, 0, 0, canvas.width, canvas.height);
          // Re-encoding removes EXIF/GPS metadata from the photograph we upload.
          canvas.toBlob((blob) => {
            if (!blob || blob.size > 2097152) { setError('No se pudo optimizar la fotografía. Prueba con otra imagen.'); setReading(false); return; }
            setFile(new File([blob], 'articulo', { type: blob.type }));
            setImage(canvas.toDataURL(blob.type, 0.85)); setReading(false);
          }, 'image/webp', 0.85);
        } catch { setError('No se pudo preparar la fotografía. Elige una imagen más pequeña.'); setReading(false); }
      };
      picture.onerror = () => { setError('El archivo no contiene una imagen válida. Elige otra fotografía.'); setReading(false); };
      picture.src = source;
    };
    reader.onerror = () => { setError('No se pudo leer la imagen. Intenta con otro archivo.'); setReading(false); };
    reader.readAsDataURL(file);
  }
  async function submit(e) {
    e.preventDefault();
    if (!image) { setError('Añade una fotografía para publicar tu artículo.'); fileInput.current?.focus(); return; }
    if (form.title.trim().length < 5 || form.description.trim().length < 15) { setError('Escribe un título de al menos 5 caracteres y una descripción de al menos 15, sin contar espacios al inicio o al final.'); return; }
    setError('');
    setPosting(true);
    try { const result = await saveProduct(form, file, existing); await onPublish(result); }
    catch (failure) { setError(failure.message || 'No se pudo guardar la publicación.'); }
    finally { setPosting(false); }
  }
  return <>
    <section className="page-heading"><h1>{existing ? 'Edita tu publicación' : 'Tu artículo. Su próxima historia'}<span className="heading-dot">.</span></h1><p>Tu publicación y su fotografía se guardarán en Supabase y serán visibles para otras personas.</p></section>
    <div className="publish-layout"><form className="publish-form" onSubmit={submit}><fieldset disabled={posting}>
      <section className="form-section"><h2><Camera size={20} /> Que entre por los ojos</h2><p>Una buena fotografía hace la diferencia.</p><label className={`upload-area ${image ? 'has-image' : ''}`}>{image ? <img src={image} alt="Vista previa de la fotografía seleccionada" /> : <><ImagePlus size={31} /><strong>Selecciona la foto de tu artículo</strong><span>JPG, PNG o WebP · Máximo 2 MB</span></>}<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} aria-label="Fotografía del artículo" disabled={reading} /></label>{image && <button className="text-button" type="button" onClick={() => { setImage(''); setFile(null); if (fileInput.current) fileInput.current.value = ''; }}><X size={14} /> Quitar fotografía</button>}{reading && <p role="status">Cargando fotografía…</p>}</section>
      <section className="form-section"><h2>Cuéntanos qué vendes</h2><label>Título del artículo<input name="title" value={form.title} onChange={update} placeholder="Ej. Nintendo Switch OLED con accesorios" maxLength="90" minLength="5" required /></label><div className="form-row"><label>Categoría<select name="category" value={form.category} onChange={update}>{categories.slice(1).map((category) => <option key={category}>{category}</option>)}</select></label><label>Estado<select name="condition" value={form.condition} onChange={update}><option>Nuevo</option><option>Como nuevo</option><option>Buen estado</option><option>Con detalles</option></select></label></div><label>Descripción<textarea name="description" value={form.description} onChange={update} rows="4" minLength="15" maxLength="1500" placeholder="Describe su estado, qué incluye y cualquier detalle que deban conocer." required /></label><label>Zona de Querétaro<select name="area" value={form.area} onChange={update}>{['Centro', 'Juriquilla', 'Centro Sur', 'El Refugio', 'Milenio III', 'Zibatá', 'Otra zona de Querétaro'].map((area) => <option key={area}>{area}</option>)}</select></label></section>
      <section className="form-section"><h2>Elige cómo darle salida</h2><div className="mode-options" role="group" aria-label="Modalidad de venta">{modes.map(({ id, label, text, icon: Icon }) => <button className={form.type === id ? 'active' : ''} type="button" key={id} disabled={id === 'auction'} onClick={() => setForm((current) => ({ ...current, type: id }))} aria-pressed={form.type === id}><Icon size={20} /><strong>{label}</strong><span>{id === 'auction' ? 'En desarrollo' : text}</span>{form.type === id && <Check className="mode-check" size={14} />}</button>)}</div><div className="form-row"><label>{form.type === 'auction' ? 'Precio inicial (MXN)' : form.type === 'offers' ? 'Precio de referencia (MXN)' : 'Precio (MXN)'}<input name="price" type="number" min="1" max="1000000" step="1" value={form.price} onChange={update} placeholder="$0" required /></label>{form.type === 'auction' && <label>Duración del contador<select name="duration" value={form.duration} onChange={update}><option value="1">1 hora</option><option value="24">24 horas</option><option value="48">48 horas</option><option value="72">72 horas</option></select></label>}</div><p className="field-hint">{form.type === 'auction' ? 'El contador es ilustrativo. No se recibirán pujas reales.' : form.type === 'offers' ? 'Se publicará un precio de referencia. El envío de ofertas todavía no está disponible.' : 'El precio será visible. No se podrán realizar compras.'}</p></section>
      {error && <p className="field-error" role="alert">{error}</p>}<div className="publish-submit"><p><Info size={16} /> Tu publicación será pública. No incluyas domicilios ni información privada.</p><button className="primary-button" type="submit" disabled={reading || posting}>{posting ? 'Guardando…' : existing ? 'Guardar cambios' : 'Publicar artículo'} <ArrowRight size={17} /></button></div>
    </fieldset></form><aside className="preview-panel"><h2>Así se verá tu artículo</h2><p>Vista previa de tu publicación</p><div className="preview-card"><ProductCard product={preview} favorites={[]} previewMode /></div><div className="demo-notice"><Info size={20} /><p>Publica únicamente fotografías que puedas utilizar y datos del artículo. Tu correo no se mostrará a otros usuarios.</p></div></aside></div>
  </>;
}
