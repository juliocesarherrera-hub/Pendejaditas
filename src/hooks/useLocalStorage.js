import { useState } from 'react';

export function useLocalStorage(key, fallback, validate) {
  const [value, setValue] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      return saved !== null && validate(saved) ? saved : fallback;
    } catch { return fallback; }
  });
  const [warning, setWarning] = useState(false);
  function update(next) {
    const updated = typeof next === 'function' ? next(value) : next;
    setValue(updated);
    try { localStorage.setItem(key, JSON.stringify(updated)); }
    catch { setWarning(true); }
  }
  return [value, update, warning];
}
