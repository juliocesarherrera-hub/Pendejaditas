export const categories = ['Consolas', 'Videojuegos', 'Accesorios', 'Componentes', 'Coleccionables'];
export const conditions = ['Nuevo', 'Como nuevo', 'Buen estado', 'Con detalles'];
export const areas = ['Centro', 'Juriquilla', 'Centro Sur', 'El Refugio', 'Milenio III', 'Zibatá', 'Otra zona de Querétaro'];
export const imageTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export function validateProduct(value) {
  if (typeof value.title !== 'string' || value.title.trim().length < 5 || value.title.trim().length > 90) throw new Error('El título debe tener entre 5 y 90 caracteres.');
  if (typeof value.description !== 'string' || value.description.trim().length < 15 || value.description.trim().length > 1500) throw new Error('La descripción debe tener entre 15 y 1500 caracteres.');
  if (!categories.includes(value.category) || !conditions.includes(value.condition) || !areas.includes(value.area)) throw new Error('Selecciona una categoría, estado y zona válidos.');
  if (!['fixed', 'offers'].includes(value.type)) throw new Error('Las subastas todavía no están disponibles.');
  const price = Number(value.price);
  if (!Number.isInteger(price) || price < 1 || price > 1000000) throw new Error('El precio debe ser un número entero entre 1 y 1,000,000 MXN.');
  return { title: value.title.trim(), description: value.description.trim(), category: value.category, condition: value.condition, sale_type: value.type, price, area: value.area };
}
export function validateImage(file) {
  if (!file || !imageTypes[file.type] || file.size < 1 || file.size > 2097152) throw new Error('Selecciona una fotografía JPG, PNG o WebP de hasta 2 MB.');
}
export function validateProfile(name, bio = '') {
  if (name.trim().length < 2 || name.trim().length > 60 || bio.length > 500) throw new Error('El nombre público debe tener entre 2 y 60 caracteres y la descripción hasta 500.');
  return { display_name: name.trim(), bio: bio.trim(), city: 'Querétaro' };
}
