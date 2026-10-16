const $ = (sel) => document.querySelector(sel);

const els = {
  drop: $('#drop'),
  picker: $('#picker'),
  toolbar: $('#toolbar'),
  bulk: $('#bulk-target'),
  quality: $('#quality'),
  qualityValue: $('#quality-value'),
  convertAll: $('#convert-all'),
  clear: $('#clear'),
  list: $('#list'),
  engines: $('#engines'),
};

const ALIASES = { jpeg: 'jpg', tif: 'tiff', htm: 'html', markdown: 'md', oga: 'ogg' };
const PARALLEL = 2;

const state = { categories: [], items: [], busy: false };

const extOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');

function formatBytes(n) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function outputsFor(ext) {
  const category = state.categories.find((c) => c.inputs.includes(ext));
  if (!category) return { category: null, outputs: [] };
  const self = ALIASES[ext] ?? ext;
  return { category, outputs: category.outputs.filter((o) => o !== self) };
}

function addFiles(files) {
  for (const file of files) {
    const ext = extOf(file.name);
    const { category, outputs } = outputsFor(ext);
    let error = null;
    if (!category) error = `.${ext || '?'} no soportado`;
    else if (!category.available) error = `Falta ${category.engine}`;
    state.items.push({
      id: crypto.randomUUID(),
      file,
      category,
      outputs,
      target: outputs[0] ?? '',
      status: error ? 'error' : 'pending',
      message: error,
      result: null,
    });
  }
  render();
}

function render() {
  els.toolbar.hidden = state.items.length === 0;
  renderBulkOptions();
  els.list.replaceChildren(...state.items.map(renderItem));
  const pending = state.items.some((i) => i.status === 'pending');
  els.convertAll.disabled = state.busy || !pending;
}

function renderBulkOptions() {
  const all = new Set(state.items.filter((i) => i.status === 'pending').flatMap((i) => i.outputs));
  const current = els.bulk.value;
  els.bulk.replaceChildren(new Option('— elegir —', ''), ...[...all].sort().map((o) => new Option(o.toUpperCase(), o)));
  els.bulk.value = all.has(current) ? current : '';
}

function renderItem(item) {
  const li = document.createElement('li');
  li.className = 'item';

  const name = document.createElement('div');
  name.className = 'name';
  name.innerHTML = '<strong></strong><small></small>';
  name.querySelector('strong').textContent = item.file.name;
  name.querySelector('small').textContent = `${formatBytes(item.file.size)}${item.category ? ` · ${item.category.label}` : ''}`;

  const select = document.createElement('select');
  select.disabled = item.status !== 'pending' || state.busy;
  for (const o of item.outputs) select.add(new Option(o.toUpperCase(), o));
  select.value = item.target;
  select.addEventListener('change', () => { item.target = select.value; });

  const status = document.createElement('div');
  status.className = `status ${item.status}`;
  if (item.status === 'done') {
    const a = document.createElement('a');
    a.href = `/api/download/${item.result.id}`;
    a.textContent = `Descargar (${formatBytes(item.result.size)})`;
    status.append(a);
  } else {
    status.textContent = { pending: 'En espera', working: 'Convirtiendo…', error: item.message }[item.status];
    if (item.status === 'error') status.title = item.message;
  }

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'ghost remove';
  remove.textContent = '✕';
  remove.title = 'Quitar';
  remove.disabled = item.status === 'working';
  remove.addEventListener('click', () => {
    state.items = state.items.filter((i) => i !== item);
    render();
  });

  li.append(name, select, status, remove);
  return li;
}

async function convertItem(item) {
  item.status = 'working';
  render();
  const body = new FormData();
  body.append('target', item.target);
  if (item.category.engine === 'sharp') body.append('quality', els.quality.value);
  body.append('file', item.file);
  try {
    const res = await fetch('/api/convert', { method: 'POST', body });
    const data = await res.json().catch(() => ({ error: `Error HTTP ${res.status}` }));
    if (!res.ok) throw new Error(data.error);
    item.status = 'done';
    item.result = data;
  } catch (err) {
    item.status = 'error';
    item.message = err.message;
  }
  render();
}

async function convertAll() {
  state.busy = true;
  render();
  const queue = state.items.filter((i) => i.status === 'pending' && i.target);
  const worker = async () => {
    while (queue.length) await convertItem(queue.shift());
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  state.busy = false;
  render();
}

function renderEngines(tools) {
  const labels = { sharp: 'sharp (imágenes)', ffmpeg: 'FFmpeg (audio y video)', libreoffice: 'LibreOffice (oficina)', pandoc: 'Pandoc (Markdown, HTML, EPUB)' };
  els.engines.replaceChildren(...Object.entries(tools).map(([k, ok]) => {
    const li = document.createElement('li');
    li.textContent = `${ok ? '✔' : '✘'} ${labels[k] ?? k}${ok ? '' : ' — no instalado'}`;
    if (!ok) li.className = 'off';
    return li;
  }));
}

els.picker.addEventListener('change', () => { addFiles(els.picker.files); els.picker.value = ''; });
els.drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') els.picker.click(); });
for (const type of ['dragenter', 'dragover']) {
  els.drop.addEventListener(type, (e) => { e.preventDefault(); els.drop.classList.add('over'); });
}
for (const type of ['dragleave', 'drop']) {
  els.drop.addEventListener(type, () => els.drop.classList.remove('over'));
}
els.drop.addEventListener('drop', (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); });
els.quality.addEventListener('input', () => { els.qualityValue.textContent = els.quality.value; });
els.bulk.addEventListener('change', () => {
  const target = els.bulk.value;
  if (!target) return;
  for (const item of state.items) if (item.status === 'pending' && item.outputs.includes(target)) item.target = target;
  render();
});
els.convertAll.addEventListener('click', convertAll);
els.clear.addEventListener('click', () => {
  state.items = state.items.filter((i) => i.status === 'working');
  render();
});

const res = await fetch('/api/formats');
const { categories, tools } = await res.json();
state.categories = categories;
renderEngines(tools);
