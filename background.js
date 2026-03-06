/**
 * Persistent Pinned Tabs - Background Service Worker
 * Manages storage, context menus, and native pinned tab injection.
 */

const STORAGE_KEY = 'pinnedTabs';

// Initialize storage and context menu on install
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  if (!data[STORAGE_KEY]) {
    await chrome.storage.local.set({ [STORAGE_KEY]: [] });
  }

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'persist-pin-current',
      title: 'Persistent Pin current tab',
      contexts: ['action'],
    });
  });
});

// Extension icon click opens settings page
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// Persistently pin from the extension toolbar icon's context menu
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'persist-pin-current') return;

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.url) return;
  if (activeTab.incognito) return;

  const url = activeTab.url;
  if (url.startsWith('chrome://') || url.startsWith('brave://') || url.startsWith('about:')) return;

  await addPin({ url, favicon: activeTab.favIconUrl || null, title: activeTab.title || '' });
});

// Add a new pin
async function addPin(pin) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const pins = data[STORAGE_KEY] || [];
  const url = pin.url.replace(/#.*$/, '').replace(/\?$/, '');
  if (pins.some((p) => p.url === url)) return;

  const newPin = {
    id: crypto.randomUUID(),
    url,
    favicon: pin.favicon || null,
    title: pin.title || '',
  };
  pins.push(newPin);
  await chrome.storage.local.set({ [STORAGE_KEY]: pins });

  // Inject the new pin into the focused window as a native pinned tab
  try {
    const win = await chrome.windows.getLastFocused();
    if (win && !win.incognito) {
      const existing = await chrome.tabs.query({ windowId: win.id, pinned: true });
      if (!existing.some((t) => normalizeUrl(t.url) === normalizeUrl(url))) {
        chrome.tabs.create({
          windowId: win.id,
          url: newPin.url,
          pinned: true,
          index: 0,
          active: false,
        });
      }
    }
  } catch {
    // Ignore if we can't get window
  }
}

// Remove a pin by id
async function removePin(id) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const pins = (data[STORAGE_KEY] || []).filter((p) => p.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY]: pins });
}

// Reorder pins
async function reorderPins(pins) {
  await chrome.storage.local.set({ [STORAGE_KEY]: pins });
}

// Update a pin (e.g. URL or title)
async function updatePin(id, updates) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const pins = data[STORAGE_KEY] || [];
  const idx = pins.findIndex((p) => p.id === id);
  if (idx === -1) return;
  pins[idx] = { ...pins[idx], ...updates };
  await chrome.storage.local.set({ [STORAGE_KEY]: pins });
}

// Handle messages from options page
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'get-pins') {
    chrome.storage.local.get(STORAGE_KEY).then((data) => {
      sendResponse({ pins: data[STORAGE_KEY] || [] });
    });
    return true;
  }
  if (msg.type === 'add-pin') {
    addPin(msg.pin).then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === 'remove-pin') {
    removePin(msg.id).then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === 'reorder-pins') {
    reorderPins(msg.pins).then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === 'update-pin') {
    updatePin(msg.id, msg.updates).then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === 'open-tab') {
    chrome.tabs.create({ url: msg.url });
    sendResponse({ ok: true });
    return false;
  }
});

// Mirror the browser's native Pin/Unpin tab actions into the persist-pin list.
// When the user pins a tab via the context menu, add it as a persist-pin.
// When they unpin one, remove it so it doesn't come back on next startup.
//
// The browser fires onUpdated(pinned:false) during tab teardown, BEFORE onRemoved.
// So we can't act on pinned:false immediately — instead we schedule the removal
// and cancel it if onRemoved arrives first (meaning the tab was closed, not unpinned).
const pendingUnpins = new Map(); // tabId -> { timeoutId, url }

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.pinned === undefined) return;
  if (tab.incognito) return;

  if (changeInfo.pinned === true) {
    // Cancel any pending unpin for this tab (e.g. rapid unpin/re-pin)
    const pending = pendingUnpins.get(tabId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pendingUnpins.delete(tabId);
    }
    if (!tab.url) return;
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('brave://') || tab.url.startsWith('about:')) return;
    await addPin({ url: tab.url, favicon: tab.favIconUrl || null, title: tab.title || '' });
  } else if (changeInfo.pinned === false) {
    const url = tab.url?.replace(/#.*$/, '').replace(/\?$/, '') ?? '';
    const timeoutId = setTimeout(async () => {
      pendingUnpins.delete(tabId);
      const data = await chrome.storage.local.get(STORAGE_KEY);
      const pins = data[STORAGE_KEY] || [];
      const match = pins.find((p) => normalizeUrl(p.url) === normalizeUrl(url));
      if (match) await removePin(match.id);
    }, 500);
    pendingUnpins.set(tabId, { timeoutId, url });
  }
});

// If the tab was closed (not unpinned), onRemoved fires within the 500ms window.
// Cancel the pending removal so closing a pinned tab doesn't drop it from the list.
chrome.tabs.onRemoved.addListener((tabId) => {
  const pending = pendingUnpins.get(tabId);
  if (pending) {
    clearTimeout(pending.timeoutId);
    pendingUnpins.delete(tabId);
  }
});

// Sync pin order when the user drags pinned tabs to new positions.
// Querying pinned tabs after a move returns them in their current visual order.
let reorderDebounceTimer = null;

chrome.tabs.onMoved.addListener(async (tabId, moveInfo) => {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.pinned || tab.incognito) return;

  // Debounce: a single drag fires many onMoved events; only act on the last one
  clearTimeout(reorderDebounceTimer);
  reorderDebounceTimer = setTimeout(async () => {
    const pinnedTabs = await chrome.tabs.query({ windowId: moveInfo.windowId, pinned: true });
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const pins = data[STORAGE_KEY] || [];

    // Build the new order: pins that have an open tab, in visual tab order
    const reordered = [];
    for (const t of pinnedTabs) {
      const match = pins.find((p) => normalizeUrl(p.url) === normalizeUrl(t.url));
      if (match) reordered.push(match);
    }
    // Append any pins not currently open in this window (preserve their relative order)
    for (const p of pins) {
      if (!reordered.includes(p)) reordered.push(p);
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: reordered });
  }, 150);
});

// Debounce: avoid injecting into the same window multiple times in quick succession (startup race)
const injectedWindows = new Map();
const INJECT_DEBOUNCE_MS = 2000;

// Set synchronously when onStartup fires so that onCreated skips injection during browser
// startup. onStartup handles injection after Brave's session restore has settled.
let startupInProgress = false;

async function injectPinsIntoWindow(windowId) {
  const now = Date.now();
  const last = injectedWindows.get(windowId);
  if (last && now - last < INJECT_DEBOUNCE_MS) return;
  injectedWindows.set(windowId, now);
  if (injectedWindows.size > 20) {
    const oldest = [...injectedWindows.entries()].sort((a, b) => a[1] - b[1])[0];
    if (oldest) injectedWindows.delete(oldest[0]);
  }

  try {
    const window = await chrome.windows.get(windowId);
    if (window.incognito) return;
    if (window.type !== 'normal') return;

    const data = await chrome.storage.local.get(STORAGE_KEY);
    let pins = data[STORAGE_KEY] || [];
    const originalCount = pins.length;

    // De-duplicate pins by URL (keep first occurrence)
    const seen = new Set();
    pins = pins.filter((p) => {
      const key = normalizeUrl(p.url);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Persist deduplicated list back to storage if we removed duplicates
    if (pins.length !== originalCount) {
      await chrome.storage.local.set({ [STORAGE_KEY]: pins });
    }

    if (pins.length === 0) return;

    const existingPinned = await chrome.tabs.query({ windowId, pinned: true });

    // Remove duplicate pinned tabs (keep one per URL, close extras)
    const urlToTab = new Map();
    for (const tab of existingPinned.filter((t) => t.url?.startsWith('http'))) {
      const key = normalizeUrl(tab.url);
      if (urlToTab.has(key)) {
        chrome.tabs.remove(tab.id);
      } else {
        urlToTab.set(key, tab);
      }
    }

    const existingUrls = new Set(urlToTab.keys());
    const toAdd = pins.filter((p) => !existingUrls.has(normalizeUrl(p.url)));
    if (toAdd.length === 0) return;

    // Create in reverse order so first pin ends up leftmost
    for (let i = toAdd.length - 1; i >= 0; i--) {
      await chrome.tabs.create({
        windowId,
        url: toAdd[i].url,
        pinned: true,
        index: 0,
        active: false,
      });
    }
  } catch (e) {
    console.warn('Persistent Pinned Tabs: could not inject pins', e);
  }
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname.replace(/\/$/, '') || u.origin + '/';
  } catch {
    return url;
  }
}

chrome.windows.onCreated.addListener((window) => {
  // During browser startup, onStartup handles injection after session restore settles.
  // This prevents creating tabs that session restore will also recreate.
  if (startupInProgress) return;
  if (window.id) injectPinsIntoWindow(window.id);
});

chrome.runtime.onStartup.addListener(async () => {
  // Set the flag synchronously (before any await) so onCreated skips injection
  // for any session-restored windows that fire while we wait.
  startupInProgress = true;

  // Wait for Brave's session restore to complete before checking/injecting.
  await new Promise((r) => setTimeout(r, 2500));

  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  for (const win of windows) {
    if (!win.incognito && win.id) {
      await injectPinsIntoWindow(win.id);
    }
  }

  startupInProgress = false;
});

