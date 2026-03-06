/**
 * Persistent Pinned Tabs - Options Page
 * Manual add, remove, edit, and reorder pins.
 */

const STORAGE_KEY = 'pinnedTabs';
const pinsList = document.getElementById('pins-list');
const emptyState = document.getElementById('empty-state');
const newUrlInput = document.getElementById('new-url');
const addPinBtn = document.getElementById('add-pin');

async function getPins() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

async function savePins(pins) {
  await chrome.storage.local.set({ [STORAGE_KEY]: pins });
}

function createPinRow(pin) {
  const li = document.createElement('li');
  li.className = 'pin-row';
  li.draggable = true;
  li.dataset.id = pin.id;

  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.textContent = '⋮⋮';
  handle.title = 'Drag to reorder';

  const input = document.createElement('input');
  input.type = 'url';
  input.value = pin.url;
  input.placeholder = 'https://...';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn btn-danger remove-btn';
  removeBtn.textContent = 'Remove';

  li.appendChild(handle);
  li.appendChild(input);
  li.appendChild(removeBtn);

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const pins = await getPins();
      const idx = pins.findIndex((p) => p.id === pin.id);
      if (idx !== -1) {
        pins[idx] = { ...pins[idx], url: input.value.trim() || pins[idx].url };
        await savePins(pins);
      }
    }, 500);
  });

  input.addEventListener('blur', async () => {
    const pins = await getPins();
    const idx = pins.findIndex((p) => p.id === pin.id);
    if (idx !== -1 && input.value.trim()) {
      pins[idx] = { ...pins[idx], url: input.value.trim() };
      await savePins(pins);
    }
  });

  removeBtn.addEventListener('click', async () => {
    const pins = (await getPins()).filter((p) => p.id !== pin.id);
    await savePins(pins);
    renderPins(pins);
  });

  // Drag and drop
  li.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', pin.id);
    li.classList.add('dragging');
  });

  li.addEventListener('dragend', () => {
    li.classList.remove('dragging');
    document.querySelectorAll('.pin-row').forEach((el) => el.classList.remove('drag-over'));
  });

  li.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const id = e.dataTransfer.getData('text/plain');
    if (id && id !== pin.id) {
      li.classList.add('drag-over');
    }
  });

  li.addEventListener('dragleave', () => {
    li.classList.remove('drag-over');
  });

  li.addEventListener('drop', async (e) => {
    e.preventDefault();
    li.classList.remove('drag-over');
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === pin.id) return;

    const pins = await getPins();
    const fromIdx = pins.findIndex((p) => p.id === draggedId);
    const toIdx = pins.findIndex((p) => p.id === pin.id);
    if (fromIdx === -1 || toIdx === -1) return;

    const [removed] = pins.splice(fromIdx, 1);
    pins.splice(toIdx, 0, removed);
    await savePins(pins);
    renderPins(pins);
  });

  return li;
}

function renderPins(pins) {
  pinsList.innerHTML = '';
  if (pins.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');
  pins.forEach((pin) => {
    pinsList.appendChild(createPinRow(pin));
  });
}

addPinBtn.addEventListener('click', async () => {
  const url = newUrlInput.value.trim();
  if (!url) return;

  const pins = await getPins();
  const normalized = url.replace(/#.*$/, '').replace(/\?$/, '');
  if (pins.some((p) => p.url === normalized)) {
    newUrlInput.value = '';
    return;
  }

  pins.push({
    id: crypto.randomUUID(),
    url: normalized,
    favicon: null,
    title: '',
  });
  await savePins(pins);
  newUrlInput.value = '';
  renderPins(pins);
});

newUrlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    addPinBtn.click();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.pinnedTabs?.newValue) {
    renderPins(changes.pinnedTabs.newValue);
  }
});

getPins().then(renderPins);
