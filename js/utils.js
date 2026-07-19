/* ============================================================
   utils.js — Utility condivise (UI, formattazione, file)
   ============================================================ */
(function (global) {
  'use strict';

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  // Aggiunge mesi a una data ISO (o a oggi) e ritorna ISO YYYY-MM-DD
  function addMonthsISO(iso, months) {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d)) return '';
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function esitoBadge(esito) {
    const map = {
      'Conforme': 'bg-success',
      'Conforme con prescrizioni': 'bg-warning text-dark',
      'Non conforme': 'bg-danger'
    };
    return `<span class="badge ${map[esito] || 'bg-secondary'}">${esc(esito || '—')}</span>`;
  }

  function statoNcBadge(stato) {
    const map = { 'Aperta': 'bg-danger', 'In corso': 'bg-warning text-dark', 'Chiusa': 'bg-success' };
    return `<span class="badge ${map[stato] || 'bg-secondary'}">${esc(stato || '—')}</span>`;
  }

  function rischioBadge(l) {
    const map = { 'Alto': 'bg-danger', 'Medio': 'bg-warning text-dark', 'Basso': 'bg-info text-dark' };
    return `<span class="badge ${map[l] || 'bg-secondary'}">${esc(l || '—')}</span>`;
  }

  function classeDannoBadge(c) {
    if (!c) return '<span class="text-muted">—</span>';
    const map = { 'Verde': 'bg-success', 'Giallo': 'bg-warning text-dark', 'Rosso': 'bg-danger' };
    const dot = { 'Verde': '🟢', 'Giallo': '🟡', 'Rosso': '🔴' }[c] || '';
    return `<span class="badge ${map[c] || 'bg-secondary'}">${dot} ${esc(c)}</span>`;
  }

  // Toast Bootstrap
  function toast(msg, type) {
    type = type || 'primary';
    let cont = document.getElementById('toast-container');
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'toast-container';
      cont.className = 'toast-container position-fixed bottom-0 end-0 p-3';
      cont.style.zIndex = 1200;
      document.body.appendChild(cont);
    }
    const el = document.createElement('div');
    el.className = `toast align-items-center text-bg-${type} border-0`;
    el.setAttribute('role', 'alert');
    el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(msg)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
    cont.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 3000 });
    t.show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
  }

  // Modal generico. Ritorna la promise risolta con true (conferma) / false.
  function modal(opts) {
    return new Promise((resolve) => {
      const id = 'm' + Math.random().toString(36).slice(2, 8);
      const size = opts.size ? 'modal-' + opts.size : 'modal-lg';
      const wrap = document.createElement('div');
      wrap.className = 'modal fade';
      wrap.id = id;
      wrap.tabIndex = -1;
      wrap.innerHTML = `
        <div class="modal-dialog ${size} modal-dialog-scrollable modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">${esc(opts.title || '')}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">${opts.body || ''}</div>
            <div class="modal-footer">
              ${opts.hideCancel ? '' : `<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Annulla</button>`}
              <button type="button" class="btn btn-primary" id="${id}-ok">${esc(opts.okText || 'Salva')}</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(wrap);
      const inst = new bootstrap.Modal(wrap);
      let confirmed = false;
      wrap.querySelector('#' + id + '-ok').addEventListener('click', () => {
        if (opts.onValidate && !opts.onValidate(wrap)) return;
        confirmed = true;
        inst.hide();
      });
      wrap.addEventListener('shown.bs.modal', () => {
        if (opts.onShow) opts.onShow(wrap);
        const f = wrap.querySelector('input,select,textarea');
        if (f) f.focus();
      });
      wrap.addEventListener('hidden.bs.modal', () => {
        resolve(confirmed ? wrap : false);
        wrap.remove();
      });
      inst.show();
    });
  }

  async function confirmDialog(msg, okText) {
    const res = await modal({
      title: 'Conferma', size: 'md', okText: okText || 'Conferma',
      body: `<p class="mb-0">${esc(msg)}</p>`
    });
    return !!res;
  }

  function fileToDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(file);
    });
  }

  // Ridimensiona e comprime un'immagine (con correzione orientamento EXIF).
  // Ritorna { dataURL, mime, size, w, h }. Non tocca i PDF.
  async function compressImage(file, maxDim, quality) {
    maxDim = maxDim || 1600; quality = quality || 0.72;
    let bmp;
    try {
      bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      // fallback: nessun ridimensionamento, restituisci l'originale
      const dataURL = await fileToDataURL(file);
      return { dataURL, mime: file.type, size: file.size, w: 0, h: 0 };
    }
    let { width, height } = bmp;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    const w = Math.round(width * scale), h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close && bmp.close();
    const dataURL = canvas.toDataURL('image/jpeg', quality);
    const size = Math.round((dataURL.length - 'data:image/jpeg;base64,'.length) * 3 / 4);
    return { dataURL, mime: 'image/jpeg', size, w, h };
  }

  // dataURL (base64) -> Uint8Array (per immagini nel .docx)
  function dataURLtoBytes(dataURL) {
    const b64 = dataURL.split(',')[1] || '';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function bytesHuman(n) {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(n) / Math.log(1024));
    return (n / Math.pow(1024, i)).toFixed(1) + ' ' + u[i];
  }

  // costruisce <option> list
  function options(list, selected) {
    return list.map(v => {
      const val = typeof v === 'object' ? v.value : v;
      const lab = typeof v === 'object' ? v.label : v;
      return `<option value="${esc(val)}" ${String(val) === String(selected) ? 'selected' : ''}>${esc(lab)}</option>`;
    }).join('');
  }

  global.U = {
    esc, todayISO, fmtDate, esitoBadge, statoNcBadge, rischioBadge, classeDannoBadge,
    toast, modal, confirmDialog, fileToDataURL, compressImage, dataURLtoBytes,
    downloadBlob, bytesHuman, options, addMonthsISO
  };
})(window);
