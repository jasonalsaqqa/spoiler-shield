const $ = id => document.getElementById(id);
const D = self.SSB_DEFAULTS;
let state = { ...D };
let host = null;

// Opened as the options page in a full tab.
if (location.search.includes('tab') || window.outerWidth > 500) document.body.classList.add('tab');

function render() {
  $('enabled').checked = state.enabled;
  $('pageGuard').checked = state.pageGuard;
  for (const b of $('mode').querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === state.mode);
  if (document.activeElement !== $('keywords')) $('keywords').value = state.keywords.join('\n');
  if (host) {
    $('siteRow').hidden = false;
    $('host').textContent = host;
    $('siteOn').checked = !state.disabledSites.includes(host);
  }
}

function save(patch) {
  state = { ...state, ...patch };
  chrome.storage.sync.set(patch);
  render();
}

function flashSaved() {
  $('saved').classList.add('show');
  setTimeout(() => $('saved').classList.remove('show'), 1200);
}

chrome.storage.sync.get(null, s => {
  state = { ...D, ...s };
  render();
});

chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  const tab = tabs && tabs[0];
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { type: 'getStatus' }, res => {
    if (chrome.runtime.lastError || !res) {
      $('status').textContent = "Can't run on this page (browser pages and the Web Store are off-limits).";
      return;
    }
    host = res.host;
    if (!res.active) $('status').textContent = 'Paused on this page.';
    else if (res.count === 0) $('status').textContent = 'Nothing hidden on this page.';
    else $('status').innerHTML = `<b>${res.count}</b> item${res.count === 1 ? '' : 's'} hidden on this page.`;
    render();
  });
});

$('enabled').addEventListener('change', e => save({ enabled: e.target.checked }));
$('pageGuard').addEventListener('change', e => save({ pageGuard: e.target.checked }));
$('siteOn').addEventListener('change', e => {
  const set = new Set(state.disabledSites);
  e.target.checked ? set.delete(host) : set.add(host);
  save({ disabledSites: [...set] });
});
$('mode').addEventListener('click', e => {
  const v = e.target.dataset && e.target.dataset.v;
  if (v) save({ mode: v });
});
$('save').addEventListener('click', () => {
  const list = $('keywords').value.split('\n').map(s => s.trim()).filter(Boolean);
  save({ keywords: [...new Set(list)] });
  $('keywords').value = state.keywords.join('\n');
  flashSaved();
});
$('reset').addEventListener('click', () => {
  save({ keywords: [...D.keywords] });
  $('keywords').value = state.keywords.join('\n');
  flashSaved();
});
