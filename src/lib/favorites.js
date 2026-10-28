const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function normalizeFavoriteId(value) {
  return typeof value === 'string' && uuid.test(value) ? value.toLowerCase() : null;
}

// Preserve unknown legacy entries. Collapse only equivalent, valid UUIDs,
// keeping their last occurrence (the most recent position in the device list).
export function normalizeFavorites(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set(), result = [];
  for (const value of [...values].reverse()) {
    const id = normalizeFavoriteId(value);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    result.push(id || value);
  }
  return result.reverse();
}

export function favoriteReferences(values = []) {
  const normalized = normalizeFavorites(values);
  const ids = normalized.flatMap(value => normalizeFavoriteId(value) || []).reverse();
  return { ids, legacyCount: normalized.length - ids.length };
}

export function toggleFavorite(values, value) {
  const id = normalizeFavoriteId(value);
  if (!id) return values;
  const normalized = normalizeFavorites(values);
  return normalized.includes(id) ? normalized.filter(entry => normalizeFavoriteId(entry) !== id) : [...normalized, id];
}
