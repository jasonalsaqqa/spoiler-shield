// Shared defaults. Loaded by the content script, the popup and the service worker.
self.SSB_DEFAULTS = {
  enabled: true,
  mode: 'blur',          // 'blur' | 'hide'
  pageGuard: true,       // full-page warning when the page itself is about a keyword
  disabledSites: [],     // hostnames without "www."
  keywords: [
    'gta',
    'gta 6',
    'gta vi',
    'grand theft auto',
    'rockstar games',
    'vice city',
    'leonida',
    'lucia caminos',
    'jason duval'
  ]
};

// Turns the keyword list into one case-insensitive regex.
// Plain keywords match as whole words, and spaces inside a keyword are flexible,
// so "gta 6" also catches "GTA6", "gta-6" and "GTA_6".
// Lines written as /.../ are used as raw regex.
// loose = true drops the word boundaries. Used as a cheap pre-check on concatenated
// textContent, where "Home" + "GTA 6" becomes "HomeGTA 6" and would fail a strict test.
self.SSB_buildRegex = function (list, loose) {
  const parts = [];
  for (let raw of list || []) {
    raw = String(raw).trim();
    if (!raw) continue;
    if (raw.length > 2 && raw.startsWith('/') && raw.endsWith('/')) {
      const body = raw.slice(1, -1);
      try { new RegExp(body, 'iu'); parts.push('(?:' + body + ')'); } catch (e) { /* skip bad regex */ }
      continue;
    }
    const words = raw.split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const core = words.join('[\\s\\-_.:]*');
    parts.push(loose ? core : '(?<![\\p{L}\\p{N}])' + core + '(?![\\p{L}\\p{N}])');
  }
  if (!parts.length) return null;
  try { return new RegExp(parts.join('|'), 'iu'); } catch (e) { return null; }
};
