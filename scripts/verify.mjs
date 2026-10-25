import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { selectProducts } from '../src/utils/catalog.js';
import { initialProducts } from '../src/data/products.js';
import { pageTitles, parseRoute, productRoute } from '../src/utils/navigation.js';
import { validateProduct, validateImage, validateProfile } from '../src/lib/validation.js';
import { validateConfig } from '../src/lib/config.js';
import { confirmsDeletion } from '../src/lib/storage-result.js';
import './marketplace-checks.mjs';
import './check-sql.mjs';
import { meetingPlaces, googleMapsUrl } from '../src/data/meetingPlaces.js';
import { mexicoTimeInput, previousMeeting } from '../src/utils/meeting-time.js';

assert.equal(mexicoTimeInput(new Date('2026-10-25T18:00:00Z')), '2026-10-25T12:00');
assert.equal(mexicoTimeInput(new Date('2026-10-25T05:30:00Z')), '2026-10-24T23:30');
assert.equal(previousMeeting({status: 'accepted'}, {status: 'confirmed', starts_at: '2026-10-25T18:00:00Z'}, Date.parse('2026-10-26T00:00:00Z')), true);
assert.equal(previousMeeting({status: 'accepted'}, {status: 'proposed', starts_at: '2026-10-25T18:00:00Z'}, Date.parse('2026-10-24T00:00:00Z')), false);
assert.equal(previousMeeting({status: 'cancelled'}, null), true);
for (const place of meetingPlaces) {
  const url = new URL(googleMapsUrl(place));
  assert.equal(url.hostname, 'www.google.com');
  assert.equal(url.searchParams.get('api'), '1');
  assert.ok(url.searchParams.get('query').includes(place.name) && url.searchParams.get('query').includes(place.address));
  assert.ok(place.latitude > 20 && place.latitude < 21 && place.longitude > -101 && place.longitude < -100);
}

assert.equal(confirmsDeletion({data: [], error: null}, 'owner/image.webp'), false);
assert.equal(confirmsDeletion({data: [{name: 'owner/image.webp'}], error: null}, 'owner/image.webp'), true);
assert.equal(confirmsDeletion({data: [{name: 'other/image.webp'}], error: null}, 'owner/image.webp'), false);
assert.equal(confirmsDeletion({data: null, error: {message: 'denied'}}, 'owner/image.webp'), false);

assert.ok(validateConfig('', ''));
assert.ok(validateConfig('https://example.supabase.co', 'sb_secret_never_use'));
assert.equal(validateConfig('https://example.supabase.co', 'sb_publishable_test_only'), '');
const valid = { title: 'Consola de prueba', description: 'Descripción para validar reglas del producto.', category: 'Consolas', condition: 'Buen estado', type: 'fixed', price: 1200, area: 'Centro' };
assert.equal(validateProduct(valid).price, 1200);
for (const invalid of [{price: -1}, {price: 1.5}, {price: 1000001}, {type: 'auction'}, {category: 'Otros'}, {area: 'Lugar inventado'}, {title: '   '}, {description: ''}]) assert.throws(() => validateProduct({...valid, ...invalid}));
assert.throws(() => validateImage({ type: 'image/svg+xml', size: 100 }));
assert.throws(() => validateImage({ type: 'image/jpeg', size: 2097153 }));
assert.doesNotThrow(() => validateImage({ type: 'image/jpeg', size: 1024 }));
assert.throws(() => validateProfile(' ', ''));
assert.equal(validateProfile(' Ana ', 'Hola').display_name, 'Ana');
const migration = await readFile(new URL('../supabase/migrations/202610240001_marketplace.sql', import.meta.url), 'utf8');
assert.ok(migration.includes('alter table public.products enable row level security'));
assert.ok(migration.includes('alter table public.profiles enable row level security'));
assert.ok(migration.includes('products_owner_update') && migration.includes('products_owner_delete'));
assert.ok(migration.includes('validate_product_image') && migration.includes('product_images_owner_delete'));
assert.ok(!migration.includes("sale_type in ('fixed','offers','auction')"));
console.log('OK: validación de datos, imágenes, perfil, claves públicas y presencia de reglas SQL (sin sustituir la prueba remota de RLS).');

for (const page of Object.keys(pageTitles)) assert.equal(parseRoute(`#${page}`).page, page);
for (const hash of ['', '#', '#unknown', '#toString']) assert.equal(parseRoute(hash).page, 'home');
assert.deepEqual(parseRoute('#/profile'), { page: 'profile', id: undefined });
assert.equal(parseRoute(`#${productRoute('id con espacios/ñ')}`).id, 'id con espacios/ñ');
assert.equal(parseRoute('#product/%E0%A4%A').id, undefined);
console.log('OK: rutas válidas, inicio, rutas desconocidas e identificadores codificados.');

for (const size of [640, 1280]) {
  const asset = await readFile(new URL(`../public/images/playstation-5-${size}.webp`, import.meta.url));
  assert.equal(asset.toString('ascii', 0, 4), 'RIFF');
  assert.equal(asset.toString('ascii', 8, 12), 'WEBP');
  assert.ok(asset.length < 150_000, 'La imagen de portada debe permanecer optimizada.');
}
console.log('OK: dos imágenes WebP locales optimizadas.');

// Verify combined filters against the actual demo catalog, without mutating it.
const original = initialProducts.map((product) => product.id);
assert.equal(selectProducts(initialProducts).length, 6);
assert.deepEqual(selectProducts(initialProducts, { category: 'Consolas', type: 'fixed', min: '5000', max: '7000' }).map((product) => product.id), ['ps5']);
assert.equal(selectProducts(initialProducts, { mode: 'auctions' }).length, 2);
assert.deepEqual(selectProducts(initialProducts, { mode: 'saved', favorites: ['keyboard'] }).map((product) => product.id), ['keyboard']);
assert.equal(selectProducts(initialProducts, { query: '  TECLADO MECANICO  ' })[0].id, 'keyboard');
assert.equal(selectProducts(initialProducts, { min: '1000', max: '500' }).length, 0);
assert.equal(selectProducts(initialProducts, { sort: 'low' })[0].id, 'figure');
assert.equal(selectProducts(initialProducts, { sort: 'high' })[0].id, 'ps5');
assert.deepEqual(initialProducts.map((product) => product.id), original);
console.log('OK: categoría, modalidad, precios, acentos, favoritos y ordenamiento.');


// Render checks use isolated props; no accounts or listings are created remotely.
globalThis.window = { location: { hash: '', search: '' } };
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const [{default: App}, {HomePage}, {PublishPage}, {ProductPage}, {AuthPage}, {Layout}, backend] = await Promise.all([
    server.ssrLoadModule('/src/App.jsx'), server.ssrLoadModule('/src/pages/HomePage.jsx'),
    server.ssrLoadModule('/src/pages/PublishPage.jsx'), server.ssrLoadModule('/src/pages/ProductPage.jsx'),
    server.ssrLoadModule('/src/pages/AuthPage.jsx'), server.ssrLoadModule('/src/components/Layout.jsx'),
    server.ssrLoadModule('/src/lib/supabase.js'),
  ]);
  const render = (Component, props = {}) => renderToStaticMarkup(createElement(Component, props));
  const noop = () => {};
  const shared = { favorites: [], toggleFavorite: noop, openProduct: noop, navigate: noop };
  const home = render(HomePage, { ...shared, products: [], mode: 'home', connected: true });
  assert.ok(home.includes('Aún no hay publicaciones'));
  assert.ok(home.includes('Publicar artículo'));
  assert.ok(home.includes('/images/playstation-5-640.webp'));
  assert.ok(!home.includes('PlayStation 5 · Edición digital'));
  assert.ok(render(HomePage, { ...shared, products: [], mode: 'home', connected: false }).includes('El catálogo no está disponible'));
  assert.ok(render(HomePage, { ...shared, products: [], mode: 'auctions', connected: true }).includes('Subastas en desarrollo'));
  const publish = render(PublishPage, { onPublish: noop });
  assert.ok(publish.includes('Publicar artículo'));
  assert.ok(publish.includes('disabled=""'));
  assert.ok(!publish.includes('Publicar en mi demo'));
  for (const mode of ['login','register','recover','reset']) assert.ok(render(AuthPage, { mode, navigate: noop }).includes('<form'));
  const fixture = {...initialProducts[0], ownerId: 'owner-test'};
  const detail = render(ProductPage, {...shared, product: fixture, user: {id: 'owner-test'}});
  assert.ok(detail.includes('Editar mi publicación'));
  assert.ok(!render(ProductPage, {...shared, product: fixture, user: {id: 'other-test'}}).includes('Editar mi publicación'));
  assert.ok(detail.includes('disabled=""'));
  assert.ok(!detail.includes('Simular'));
  assert.ok(render(ProductPage, shared).includes('Este artículo no está disponible'));
  for (const page of ['home','auctions','saved','publish','profile']) {
    const html = render(Layout, { page, navigate: noop, favoritesCount: 0, connected: false });
    assert.ok(html.includes('href="#'+page+'" aria-current="page"'));
    assert.ok(html.includes('Plataforma en configuración.'));
  }
  const app = render(App);
  assert.ok(app.includes('Compras, pagos y pujas aún no disponibles.'));
  assert.ok(!app.includes('Publicaciones conectadas a Supabase.'));
  const {MeetingPointsPage} = await server.ssrLoadModule('/src/pages/MeetingPointsPage.jsx');
  const points = render(MeetingPointsPage, {navigate: noop, onSelect: noop});
  assert.ok(points.includes('Cargando lugares desde Supabase'));
  assert.ok(points.includes('Mapa interactivo'));
  assert.ok(points.includes('no son puntos seguros oficiales'));
  const {AppointmentsPage} = await server.ssrLoadModule('/src/pages/AppointmentsPage.jsx');
  assert.ok(render(AppointmentsPage, {user:{id:'unit-test'},navigate:noop}).includes('Cargando citas privadas'));
  await backend.supabase?.auth.stopAutoRefresh();
  console.log('OK: catálogo vacío, estados de conexión, formularios Auth, propietario/visitante, navegación y pagos deshabilitados.');
} finally { await server.close(); }
