export function selectProducts(products, { mode = 'home', favorites = [], category = 'Todas', type = 'all', query = '', min = '', max = '', sort = 'featured' } = {}) {
  const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const selected = products.filter((product) =>
    (mode !== 'saved' || favorites.includes(product.id)) &&
    (mode !== 'auctions' || product.type === 'auction') &&
    (category === 'Todas' || category === product.category) &&
    (type === 'all' || type === product.type) &&
    normalize(product.title).includes(normalize(query.trim())) &&
    (min === '' || product.price >= Number(min)) &&
    (max === '' || product.price <= Number(max)));
  if (sort === 'low') selected.sort((a, b) => a.price - b.price);
  if (sort === 'high') selected.sort((a, b) => b.price - a.price);
  return selected;
}
