/** Limite in memoria: al massimo `max` eventi per chiave ogni `windowMs`. */
export function createLimiter(windowMs, max) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [k, a] of hits) if (now - a.first > windowMs) hits.delete(k);
  }, windowMs).unref();

  return {
    blocked(key) {
      const a = hits.get(key);
      if (!a) return false;
      if (Date.now() - a.first > windowMs) { hits.delete(key); return false; }
      return a.count >= max;
    },
    hit(key) {
      const a = hits.get(key);
      if (!a || Date.now() - a.first > windowMs) hits.set(key, { count: 1, first: Date.now() });
      else a.count++;
    },
    reset(key) { hits.delete(key); }
  };
}
