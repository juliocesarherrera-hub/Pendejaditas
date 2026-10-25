import { imageTypes, validateImage, validateProduct } from './validation.js';
import { confirmsDeletion } from './storage-result.js';
export const productColumns = 'id,owner_id,title,description,category,condition,sale_type,price,area,image_path,created_at,updated_at,profiles!products_owner_id_fkey(display_name)';


// Injectable boundary for unit tests; the application always supplies its real SDK client.
export function createMarketplace(supabase) {

function serviceError(error) {
  if (['PGRST205', 'PGRST202', '42P01', '42703', 'PGRST200'].includes(error?.code)) return 'La estructura de Supabase no coincide con la aplicación. Revisa la auditoría indicada en docs/ETAPA-2.md; no repitas la migración completa.';
  if (error?.code === '42501') return 'No tienes permiso para esta operación. Comprueba tu sesión y las políticas RLS.';
  if (error?.code === 'PGRST116') return 'La publicación cambió o ya no está disponible. Actualiza el catálogo antes de intentarlo otra vez.';
  if (error?.code === '23514') return 'Los datos o la fotografía no cumplen las reglas del servidor.';
  return 'No se pudo completar la operación con Supabase. Comprueba tu conexión y vuelve a intentarlo.';
}
function toProduct(row) {
  return { id: row.id, ownerId: row.owner_id, title: row.title, description: row.description, category: row.category, condition: row.condition, type: row.sale_type, price: Number(row.price), area: row.area, imagePath: row.image_path, image: supabase.storage.from('product-images').getPublicUrl(row.image_path).data.publicUrl, seller: row.profiles?.display_name || 'Perfil no disponible', createdAt: row.created_at, updatedAt: row.updated_at };
}
async function fetchProducts() {
  const { data, error } = await supabase.from('products').select(productColumns).order('created_at', { ascending: false });
  if (error) throw new Error(serviceError(error));
  return data.map(toProduct);
}
async function fetchProfile(id) {
  const { data, error } = await supabase.from('profiles').select('id,display_name,bio,city,created_at').eq('id', id).single();
  if (error) throw new Error(serviceError(error));
  return data;
}
async function currentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Inicia sesión para administrar tus publicaciones.');
  return data.user;
}
async function removeUnusedImage(path) {
  try {
    // A failed/lost database response must never cause a live photo to be removed.
    const references = await supabase.from('products').select('id').eq('image_path', path).limit(1);
    if (references.error || !Array.isArray(references.data) || references.data.length) return false;
    const result = await supabase.storage.from('product-images').remove([path]);
    return confirmsDeletion(result, path);
  } catch { return false; }
}
async function saveProduct(input, file, existing = null) {
  const payload = validateProduct(input);
  const user = await currentUser();
  if (existing && existing.ownerId !== user.id) throw new Error('Solo puedes editar tus propias publicaciones.');
  if (!existing || file) validateImage(file);
  let imagePath = existing?.imagePath;
  if (file) {
    imagePath = `${user.id}/${crypto.randomUUID()}.${imageTypes[file.type]}`;
    const { error } = await supabase.storage.from('product-images').upload(imagePath, file, { upsert: false, contentType: file.type, cacheControl: '3600' });
    if (error) throw new Error('No se pudo subir la fotografía. Comprueba que exista el bucket product-images y sus permisos.');
  }
  const query = existing
    ? supabase.from('products').update({ ...payload, image_path: imagePath }).eq('id', existing.id).eq('owner_id', user.id).eq('updated_at', existing.updatedAt)
    : supabase.from('products').insert({ ...payload, owner_id: user.id, image_path: imagePath });
  const { data, error } = await query.select(productColumns).single();
  if (error) {
    const cleaned = !file || await removeUnusedImage(imagePath);
    throw new Error(serviceError(error) + (cleaned ? '' : ' No se pudo confirmar la limpieza de la nueva fotografía. Revisa tu catálogo antes de volver a publicar.'));
  }
  let cleanupWarning = false;
  if (existing && file) cleanupWarning = !(await removeUnusedImage(existing.imagePath));
  return { product: toProduct(data), cleanupWarning };
}
async function deleteProduct(product) {
  const user = await currentUser();
  if (product.ownerId !== user.id) throw new Error('Solo puedes eliminar tus propias publicaciones.');
  const { data, error } = await supabase.from('products').delete().eq('id', product.id).eq('owner_id', user.id).eq('updated_at', product.updatedAt).select('id').single();
  if (error || !data) throw new Error(serviceError(error));
  return { cleanupWarning: !(await removeUnusedImage(product.imagePath)) };
}

return { serviceError, toProduct, fetchProducts, fetchProfile, saveProduct, deleteProduct };
}
