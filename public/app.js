const $ = (sel) => document.querySelector(sel);

const els = {
  drop: $('#drop'),
  picker: $('#picker'),
  toolbar: $('#toolbar'),
  bulkTarget: $('#bulk-target'),
  bulkPreset: $('#bulk-preset'),
  quality: $('#quality'),
  qualityValue: $('#quality-value'),
  convertAll: $('#convert-all'),
  clear: $('#clear'),
  list: $('#list'),
  engines: $('#engines'),
};

const ALIASES = { jpeg: 'jpg', tif: 'tiff', htm: 'html', markdown: 'md', oga: 'ogg' };
const AUDIO_OUTPUTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'opus']);
const LOSSLESS_AUDIO = new Set(['wav', 'flac']);
const ACTIVE = new Set(['uploading', 'queued', 'running']);
const FINISHED = new Set(['done', 'error', 'canceled']);
const ORPHAN_WAIT_MS = 2000;
const QUALITY_LABELS = { high: 'Alta', medium: 'Media', low: 'Baja' };

// Cada fila es un item: archivo local aún sin enviar, o trabajo del servidor (item.job).
const state = { formats: null, items: [], byJob: new Map(), orphans: new Map() };

const extOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');
const statusOf = (item) => item.job?.status ?? item.localStatus;
const isMedia = (item) => item.category?.engine === 'ffmpeg';

function formatBytes(n) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

function outputsFor(ext) {
  const category = state.formats.categories.find((c) => c.inputs.includes(ext));
  if (!category) return { category: null, outputs: [] };
  const self = ALIASES[ext] ?? ext;
  return { category, outputs: category.outputs.filter((o) => o !== self) };
}

// ---------- Alta de archivos ----------

function addFiles(files) {
  for (const file of files) {
    const ext = extOf(file.name);
    const { category, outputs } = outputsFor(ext);
    let message = null;
    if (!category) message = `.${ext || '?'} no soportado`;
    else if (!category.available) message = `Falta ${category.engine}`;
    addItem({
      key: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      category,
      outputs,
      target: outputs[0] ?? '',
      options: {},
      localStatus: message ? 'error' : 'pending',
      message,
      showOptions: false,
    });
  }
  renderToolbar();
}

function addItem(item) {
  state.items.push(item);
  els.list.append(renderItem(item));
}

function itemFromJob(job) {
  const category = state.formats.categories.find((c) => c.id === job.category) ?? null;
  const item = {
    key: job.id,
    file: null,
    name: job.originalName,
    size: null,
    category,
    outputs: [job.target],
    target: job.target,
    options: job.options ?? {},
    job,
  };
  state.byJob.set(job.id, item);
  addItem(item);
}

function removeItem(item) {
  state.items = state.items.filter((i) => i !== item);
  if (item.job) state.byJob.delete(item.job.id);
  item.el?.remove();
  renderToolbar();
}

// ---------- Render ----------

function renderToolbar() {
  els.toolbar.hidden = state.items.length === 0;
  const pending = state.items.filter((i) => statusOf(i) === 'pending');

  const targets = new Set(pending.flatMap((i) => i.outputs));
  const current = els.bulkTarget.value;
  els.bulkTarget.replaceChildren(
    new Option('— elegir —', ''),
    ...[...targets].sort().map((o) => new Option(o.toUpperCase(), o)),
  );
  els.bulkTarget.value = targets.has(current) ? current : '';

  els.convertAll.disabled = pending.length === 0;
  els.clear.disabled = !state.items.some((i) => FINISHED.has(statusOf(i)));
}

function renderItem(item) {
  const status = statusOf(item);
  const editable = status === 'pending';

  const meta = [item.size !== null ? formatBytes(item.size) : null, item.category?.label].filter(Boolean).join(' · ');
  const name = el('div', { className: 'name' }, el('strong', { textContent: item.name, title: item.name }), el('small', { textContent: meta }));

  const select = el('select', { disabled: !editable, title: 'Formato de salida' });
  for (const o of item.outputs) select.add(new Option(o.toUpperCase(), o));
  select.value = item.target;
  select.addEventListener('change', () => {
    item.target = select.value;
    rerender(item);
  });

  const gear = isMedia(item) && editable
    ? el('button', {
      type: 'button',
      className: `ghost icon${item.showOptions ? ' on' : ''}`,
      textContent: '⚙',
      title: 'Opciones de audio/video',
      onclick: () => { item.showOptions = !item.showOptions; rerender(item); },
    })
    : null;

  const remove = el('button', {
    type: 'button',
    className: 'ghost icon',
    textContent: '✕',
    title: ACTIVE.has(status) ? 'Cancelar' : 'Quitar',
    disabled: status === 'uploading',
    onclick: () => removeClicked(item),
  });

  const row = el('div', { className: 'row' }, name, select, gear ?? el('span'), renderStatus(item, status), remove);
  const li = el('li', { className: `item ${status}` }, row);
  if (gear && item.showOptions) li.append(renderOptions(item));
  const sent = item.job?.options ?? item.options;
  if (!editable && hasOptions(sent)) li.append(el('div', { className: 'chips', textContent: describeOptions(sent) }));

  item.el?.replaceWith(li);
  item.el = li;
  return li;
}

function rerender(item) {
  renderItem(item);
  renderToolbar();
}

function renderStatus(item, status) {
  const box = el('div', { className: `status ${status}` });
  switch (status) {
    case 'pending':
      box.textContent = 'Listo para convertir';
      break;
    case 'uploading':
      box.append(progressBar(item.uploadProgress), el('span', { textContent: `Subiendo ${Math.round(item.uploadProgress * 100)}%` }));
      break;
    case 'queued':
      box.textContent = 'En cola';
      break;
    case 'running': {
      // Solo FFmpeg informa progreso; el resto se muestra como barra indeterminada.
      const p = isMedia(item) ? item.job.progress : null;
      box.append(progressBar(p), el('span', { textContent: p === null ? 'Convirtiendo…' : `${Math.round(p * 100)}%` }));
      break;
    }
    case 'done': {
      const { output } = item.job;
      box.append(el('a', { href: `/api/download/${item.job.id}`, textContent: `Descargar (${formatBytes(output.size)})` }));
      break;
    }
    case 'canceled':
      box.textContent = 'Cancelado';
      break;
    default:
      box.textContent = item.job?.error ?? item.message ?? 'Error';
      box.title = box.textContent;
  }
  return box;
}

function progressBar(value) {
  const bar = el('div', { className: `bar${value === null ? ' indeterminate' : ''}` }, el('div'));
  if (value !== null) bar.firstChild.style.width = `${Math.round(value * 100)}%`;
  return bar;
}

// ---------- Opciones de audio/video ----------

function hasOptions(options) {
  return Object.keys(options ?? {}).some((k) => k !== 'imageQuality');
}

function describeOptions(o) {
  const parts = [];
  if (o.height) parts.push(`${o.height}p`);
  if (o.quality) parts.push(`calidad ${QUALITY_LABELS[o.quality].toLowerCase()}`);
  if (o.audioBitrate) parts.push(`${o.audioBitrate} kbps`);
  if (o.mono) parts.push('mono');
  if (o.noAudio) parts.push('sin audio');
  if (o.start || o.end) parts.push(`recorte ${o.start ?? 0}s–${o.end ?? 'fin'}${o.end ? 's' : ''}`);
  return parts.join(' · ');
}

function field(label, control) {
  return el('label', { className: 'field' }, el('span', { textContent: label }), control);
}

function choice(values, current, onChange, defaultLabel) {
  const select = el('select');
  select.add(new Option(defaultLabel, ''));
  for (const [value, label] of values) select.add(new Option(label, value));
  select.value = current ?? '';
  select.addEventListener('change', () => onChange(select.value || undefined));
  return select;
}

function renderOptions(item) {
  const o = item.options;
  const toAudio = AUDIO_OUTPUTS.has(item.target);
  const toGif = item.target === 'gif';
  const set = (key, value) => {
    if (value === undefined || value === false) delete o[key];
    else o[key] = value;
  };
  const fields = [];

  fields.push(field('Preset', choice(
    state.formats.presets.filter((p) => p.id !== 'default').map((p) => [p.id, p.label]),
    null,
    (id) => { applyPreset(item, id); rerender(item); },
    '— aplicar —',
  )));

  if (!toAudio) {
    fields.push(field('Resolución', choice(
      state.formats.heights.map((h) => [String(h), `${h}p`]),
      o.height && String(o.height),
      (v) => set('height', v && Number(v)),
      toGif ? '360p (GIF)' : 'Original',
    )));
  }
  if (!toAudio && !toGif) {
    fields.push(field('Calidad video', choice(
      Object.entries(QUALITY_LABELS),
      o.quality,
      (v) => set('quality', v),
      'Media (predet.)',
    )));
  }
  if (!toGif && !LOSSLESS_AUDIO.has(item.target) && !o.noAudio) {
    fields.push(field('Bitrate audio', choice(
      state.formats.audioBitrates.map((b) => [b, `${b} kbps`]),
      o.audioBitrate,
      (v) => set('audioBitrate', v),
      'Automático',
    )));
  }

  const checks = [];
  if (!toGif && !o.noAudio) checks.push(checkbox('Mono', o.mono, (v) => set('mono', v)));
  if (!toAudio && !toGif && item.category.id === 'video') {
    checks.push(checkbox('Quitar audio', o.noAudio, (v) => { set('noAudio', v); rerender(item); }));
  }

  const timeInput = (key) => {
    const input = el('input', { type: 'text', placeholder: key === 'start' ? '0:00' : 'fin', value: o[key] ?? '', inputMode: 'decimal' });
    input.addEventListener('change', () => set(key, input.value.trim() || undefined));
    return input;
  };
  fields.push(field('Recortar desde', timeInput('start')), field('hasta', timeInput('end')));

  return el('div', { className: 'options' }, ...fields, checks.length ? el('div', { className: 'checks' }, ...checks) : null);
}

function checkbox(label, checked, onChange) {
  const input = el('input', { type: 'checkbox', checked: Boolean(checked) });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { className: 'check' }, input, el('span', { textContent: label }));
}

// Un preset reemplaza las opciones de calidad pero conserva el recorte.
function applyPreset(item, presetId) {
  const preset = state.formats.presets.find((p) => p.id === presetId);
  if (!preset) return;
  const { start, end } = item.options;
  item.options = { ...preset.options };
  if (start) item.options.start = start;
  if (end) item.options.end = end;
}

// ---------- Envío y eventos ----------

function upload(item) {
  const body = new FormData();
  body.append('target', item.target);
  const options = item.category.engine === 'sharp' ? { imageQuality: Number(els.quality.value) } : item.options;
  body.append('options', JSON.stringify(options));
  body.append('file', item.file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/jobs');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      item.uploadProgress = e.loaded / e.total;
      renderItem(item);
    };
    xhr.onload = () => (xhr.status < 300 ? resolve(xhr.response) : reject(new Error(xhr.response?.error ?? `Error HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('Sin conexión con el servidor'));
    xhr.send(body);
  });
}

// Las subidas van de una en una; la cola del servidor decide cuántas se convierten a la vez.
async function convertAll() {
  const pending = state.items.filter((i) => statusOf(i) === 'pending' && i.target);
  for (const item of pending) {
    item.localStatus = 'uploading';
    item.uploadProgress = 0;
    item.showOptions = false;
    rerender(item);
  }
  for (const item of pending) {
    if (!state.items.includes(item)) continue;
    try {
      const job = await upload(item);
      item.file = null;
      item.job = state.orphans.get(job.id) ?? job;
      state.orphans.delete(job.id);
      state.byJob.set(job.id, item);
    } catch (err) {
      item.localStatus = 'error';
      item.message = err.message;
    }
    rerender(item);
  }
}

async function removeClicked(item) {
  if (!item.job) return removeItem(item);
  const res = await fetch(`/api/jobs/${item.job.id}`, { method: 'DELETE' });
  if (res.ok || res.status === 404) removeItem(item);
}

function onJobUpdate(job) {
  const item = state.byJob.get(job.id);
  if (item) {
    item.job = job;
    rerender(item);
    return;
  }
  // El aviso puede llegar antes que la respuesta de la subida: se guarda un momento.
  const uploading = state.items.some((i) => statusOf(i) === 'uploading');
  if (!uploading) return itemFromJob(job);
  state.orphans.set(job.id, job);
  setTimeout(() => {
    const latest = state.orphans.get(job.id);
    if (!latest) return;
    state.orphans.delete(job.id);
    if (!state.byJob.has(job.id)) itemFromJob(latest);
  }, ORPHAN_WAIT_MS);
}

function connectEvents() {
  const source = new EventSource('/api/events');
  source.addEventListener('update', (e) => onJobUpdate(JSON.parse(e.data)));
  source.addEventListener('removed', (e) => {
    const item = state.byJob.get(JSON.parse(e.data).id);
    if (item) removeItem(item);
  });
  // Al reconectar (p. ej. tras reiniciar el servidor) se resincroniza la lista.
  source.addEventListener('open', syncJobs);
}

async function syncJobs() {
  const jobs = await (await fetch('/api/jobs')).json();
  const ids = new Set(jobs.map((j) => j.id));
  for (const item of [...state.byJob.values()]) if (!ids.has(item.job.id)) removeItem(item);
  for (const job of jobs) onJobUpdate(job);
  renderToolbar();
}

function renderEngines(tools) {
  const labels = {
    sharp: 'sharp (imágenes)',
    ffmpeg: 'FFmpeg (audio y video)',
    libreoffice: 'LibreOffice (oficina)',
    pandoc: 'Pandoc (Markdown, HTML, EPUB)',
  };
  els.engines.replaceChildren(...Object.entries(tools).map(([k, ok]) => el('li', {
    className: ok ? '' : 'off',
    textContent: `${ok ? '✔' : '✘'} ${labels[k] ?? k}${ok ? '' : ' — no instalado'}`,
  })));
}

// ---------- Eventos de la interfaz ----------

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

els.bulkTarget.addEventListener('change', () => {
  const target = els.bulkTarget.value;
  if (!target) return;
  for (const item of state.items) {
    if (statusOf(item) === 'pending' && item.outputs.includes(target)) {
      item.target = target;
      renderItem(item);
    }
  }
});

els.bulkPreset.addEventListener('change', () => {
  for (const item of state.items) {
    if (statusOf(item) === 'pending' && isMedia(item)) {
      applyPreset(item, els.bulkPreset.value);
      renderItem(item);
    }
  }
  els.bulkPreset.value = '';
});

els.convertAll.addEventListener('click', convertAll);
els.clear.addEventListener('click', () => {
  for (const item of [...state.items]) {
    if (FINISHED.has(statusOf(item))) removeClicked(item);
  }
});

state.formats = await (await fetch('/api/formats')).json();
els.bulkPreset.replaceChildren(new Option('— aplicar —', ''), ...state.formats.presets.map((p) => new Option(p.label, p.id)));
renderEngines(state.formats.tools);
connectEvents();
