importScripts('defaults.js');

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(null);
  await chrome.storage.sync.set({ ...self.SSB_DEFAULTS, ...current });
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null) return;
  if (msg.type === 'count') {
    const n = msg.count || 0;
    chrome.action.setBadgeText({ tabId, text: n ? (n > 999 ? '999+' : String(n)) : '' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#e11d48' });
    chrome.action.setBadgeTextColor && chrome.action.setBadgeTextColor({ tabId, color: '#ffffff' });
  } else if (msg.type === 'closeTab') {
    chrome.tabs.remove(tabId);
  }
});
