const { tenantLocalStorage } = require('../config/db');
const defaultScope = {};

function createTenantState(factory) {
  const scopes = new WeakMap();
  return () => {
    const scope = tenantLocalStorage.getStore()?.pool || defaultScope;
    if (!scopes.has(scope)) scopes.set(scope, factory());
    return scopes.get(scope);
  };
}

// Pool identity is the same boundary used by query(). WeakMap entries disappear
// when a pool is retired; request parameters never create unbounded global keys.
function createTenantCache(ttlMs, maxEntries = 100) {
  const state = createTenantState(() => ({ entries: new Map(), pending: new Map() }));

  function put(cache, key, value) {
    cache.delete(key);
    if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  return {
    get(key = 'data') {
      const cache = state().entries;
      const entry = cache.get(key);
      if (!entry) return undefined;
      if (Date.now() >= entry.expiresAt) {
        cache.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      const scope = state();
      scope.pending.delete(key);
      put(scope.entries, key, value);
    },
    getOrLoad(key, loader, { force = false, cacheEmpty = true } = {}) {
      const scope = state();
      if (!force) {
        const entry = scope.entries.get(key);
        if (entry && Date.now() < entry.expiresAt) return Promise.resolve(entry.value);
        if (scope.pending.has(key)) return scope.pending.get(key).promise;
      }
      // A forced read replaces the old generation, including its completed value.
      // clear()/set() also detach old jobs so they cannot repopulate stale data.
      scope.entries.delete(key);
      const job = {};
      job.promise = Promise.resolve().then(loader).then(value => {
        if (scope.pending.get(key) === job && (cacheEmpty || !Array.isArray(value) || value.length > 0)) {
          put(scope.entries, key, value);
        }
        return value;
      }).finally(() => {
        if (scope.pending.get(key) === job) scope.pending.delete(key);
      });
      scope.pending.set(key, job);
      return job.promise;
    },
    clear() {
      const scope = state();
      scope.entries.clear();
      scope.pending.clear();
    },
  };
}

module.exports = { createTenantCache, createTenantState };
