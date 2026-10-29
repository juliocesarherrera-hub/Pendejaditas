// Synthetic, deterministic, reusable corpus; never reads user/environment data.
export const unicodeCorpus = [
  '', 'PS', 'PC', 'VR', 'DS', 'Pokémon', 'POKÉMON', 'Poke\u0301mon',
  'Niño', 'NIÑO', 'Nin\u0303o', 'NIN\u0303O', 'Nino', 'ñ\u0301', 'n\u0303\u0301',
  'PINGÜINO', 'Pingui\u0308no', 'ÁÉÍÓÚ àèìòù ÄËÏÖÜ', 'CAFE\u0301',
  'ΟΣ', 'ος', 'οσ', 'ИГРА', 'İ', 'I', 'ı', 'ẞ', 'Straße', 'STRASSE',
  '東京', '👩‍💻', '✈️', 'ＡＢ', '\ue000', '\u0301\u0308',
  '50%', 'a_b', '!%_\\', "' OR 1=1 --", '  PS  ', '\u0085PS\u3000',
];
export const fixtureId = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const owners = [1, 2, 3, 4].map(fixtureId);
const titles = ['PS5 Pokémon', 'PC PINGÜINO', 'VR Niño', 'DS Nino', 'Juego 50%',
  'Cable a_b', 'Pack %_', '!! Edición', '東京 Colección', 'ΟΣ Serie', 'Άλφα Juego', 'Otro artículo'];
const categories = ['Consolas', 'Videojuegos', 'Accesorios', 'Componentes', 'Coleccionables'];
export function catalogFixtures(count, auctionPercent = 30, skewed = false) {
  if (![0, 1, 12, 13, 100, 1000, 10000].includes(count) || ![0, 30, 80].includes(auctionPercent)) throw new Error('invalid_fixture_size');
  return Array.from({ length: count }, (_, i) => {
    const n = i + 10, owner = owners[i % 4], isAuction = i % 100 < auctionPercent;
    const price = 100 + (i % 40) * 100;
    const row = { id: fixtureId(n), owner_id: owner, title: `${titles[i % titles.length]} ${i}`,
      category: skewed ? i % 10 ? 'Consolas' : categories[1 + Math.floor(i / 10) % 4] : categories[i % 5],
      sale_type: isAuction ? 'auction' : i % 4 ? 'fixed' : 'offers', price,
      created_at: `2026-10-28T10:00:00.${String(i % 3).padStart(6, '0')}Z`,
      updated_at: '2026-10-28T10:00:00.000000Z', condition: 'Buen estado',
      area: 'Centro', image_path: `${owner}/synthetic.webp`, seller_name: 'Perfil sintético' };
    if (isAuction) row.auction = { id: fixtureId(n + 50000), product_id: row.id, seller_id: owner,
      initial_price: price, highest_amount: i % 2 ? price + 500 : null, bid_count: i % 2 ? 3 : 0,
      status: 'active', revision: 2, starts_at: '2026-10-28T00:00:00.000000Z', ends_at: '2026-11-01T00:00:00.000000Z' };
    return row;
  });
}
export const sqlCases = [
  { name: 'recent', request: {} },
  { name: 'price-up', request: { sort: 'price_asc' } },
  { name: 'price-down', request: { sort: 'price_desc' } },
  ...['PS', 'PC', 'VR', 'DS', 'niño', 'nino', 'pokemon', '50%', 'a_b', '%_', '!!', '東京', 'ΟΣ', 'ZZ', 'a'.repeat(90)]
    .map(search => ({ name: `literal-${search}`, request: { search } })),
  { name: 'combined', request: { search: 'pokemon', category: 'Consolas', min_price: 100, max_price: 3000, sort: 'price_asc' } },
  { name: 'fixed-filter', request: { sale_type: 'fixed', category: 'Consolas', min_price: 500, sort: 'price_desc' } },
  { name: 'auction-filter', request: { sale_type: 'auction', min_price: 500, max_price: 3000, sort: 'price_asc' } },
];
export const performanceCases = [
  { name: 'recent', request: {} },
  { name: 'mixed-price', request: { sort: 'price_asc' } },
  { name: 'two-PS', request: { search: 'PS' } },
  { name: 'two-PC', request: { search: 'PC' } },
  { name: 'two-VR', request: { search: 'VR' } },
  { name: 'two-DS', request: { search: 'DS' } },
  { name: 'two-common', request: { search: 'ar' } },
  { name: 'two-absent', request: { search: 'ZZ' } },
  { name: 'two-literal', request: { search: '%_' } },
  { name: 'three-plus', request: { search: 'pokemon' } },
  { name: 'combined', request: { search: 'pokemon', category: 'Consolas', sort: 'price_desc' } },
];
