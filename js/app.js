/* ============================================================
   app.js — Router, motore CRUD generico, anagrafica gerarchica
   ============================================================ */
(function (global) {
  'use strict';
  const { esc, toast, modal, confirmDialog, options } = U;

  const APP_VERSION = 'v27';

  const App = {
    view: 'dashboard',
    params: {},
    filters: {}
  };
  global.App = App;

  // ---------- Definizione risorse anagrafiche ----------
  const RES = {
    sedi: {
      store: 'sedi', title: 'Sedi', singular: 'Sede', icon: 'building',
      fields: [
        { name: 'codice', label: 'Codice sede', type: 'text', required: true, col: true },
        { name: 'nome', label: 'Nome sede', type: 'text', required: true, col: true },
        { name: 'indirizzo', label: 'Indirizzo', type: 'text', col: true },
        { name: 'responsabile', label: 'Responsabile', type: 'text', col: true },
        { name: 'note', label: 'Note', type: 'textarea' }
      ],
      child: { store: 'edifici', label: 'Edifici' }
    },
    edifici: {
      store: 'edifici', title: 'Edifici', singular: 'Edificio', icon: 'buildings',
      parent: { store: 'sedi', fk: 'idSede', labelField: 'nome', label: 'Sede' },
      fields: [
        { name: 'nome', label: 'Nome edificio', type: 'text', required: true, col: true },
        { name: 'descrizione', label: 'Descrizione', type: 'textarea', col: true }
      ],
      child: { store: 'piani', label: 'Piani' }
    },
    piani: {
      store: 'piani', title: 'Piani', singular: 'Piano', icon: 'layers',
      parent: { store: 'edifici', fk: 'idEdificio', labelField: 'nome', label: 'Edificio' },
      fields: [
        { name: 'numero', label: 'Numero piano', type: 'text', required: true, col: true },
        { name: 'descrizione', label: 'Descrizione', type: 'textarea', col: true }
      ],
      child: { store: 'ambienti', label: 'Ambienti' }
    },
    ambienti: {
      store: 'ambienti', title: 'Ambienti', singular: 'Ambiente', icon: 'door',
      parent: { store: 'piani', fk: 'idPiano', labelField: 'numero', label: 'Piano' },
      fields: [
        { name: 'codice', label: 'Codice ambiente', type: 'text', required: true, col: true },
        { name: 'tipologia', label: 'Tipologia', type: 'select', opts: () => DATA.TIPOLOGIE_AMBIENTE, required: true, col: true },
        { name: 'responsabile', label: 'Responsabile ambiente', type: 'text', col: true },
        { name: 'superficie', label: 'Superficie (m²)', type: 'number' },
        { name: 'note', label: 'Note', type: 'textarea' }
      ],
      child: { store: 'beni', label: 'Beni' }
    },
    beni: {
      store: 'beni', title: 'Beni', singular: 'Bene', icon: 'box',
      parent: { store: 'ambienti', fk: 'idAmbiente', labelField: 'codice', label: 'Ambiente' },
      fields: [
        { name: 'codice', label: 'Codice identificativo', type: 'text', required: true, col: true },
        { name: 'categoria', label: 'Categoria', type: 'select', opts: () => DATA.CATEGORIE_BENE, required: true, col: true },
        { name: 'descrizione', label: 'Descrizione', type: 'text', col: true },
        { name: 'marca', label: 'Marca', type: 'text' },
        { name: 'modello', label: 'Modello', type: 'text' },
        { name: 'anno', label: 'Anno installazione', type: 'number' },
        { name: 'altezza', label: 'Altezza (cm)', type: 'number' },
        { name: 'portata', label: 'Portata (kg)', type: 'number' },
        { name: 'ancorato', label: 'Ancorato', type: 'select', opts: () => ['', 'SI', 'NO'], col: true },
        { name: 'stato', label: 'Stato', type: 'select', opts: () => DATA.STATI_BENE, col: true }
      ],
      child: { store: 'verifiche', label: 'Verifiche' }
    }
  };
  global.RES = RES;

  // cache label parent
  async function parentMap(store) {
    const rows = await DB.all(store);
    const m = {};
    rows.forEach(r => { m[r.id] = r; });
    return m;
  }

  // ---------- Rendering vista generica ----------
  async function renderResource(key) {
    const cfg = RES[key];
    const main = document.getElementById('main');
    let rows = await DB.all(cfg.store);

    // filtro per parent se passato in params
    let parentRow = null;
    if (cfg.parent && App.params[cfg.parent.fk]) {
      rows = rows.filter(r => r[cfg.parent.fk] === App.params[cfg.parent.fk]);
      parentRow = await DB.get(cfg.parent.store, App.params[cfg.parent.fk]);
    }

    // mappe parent per etichette
    const pmap = cfg.parent ? await parentMap(cfg.parent.store) : null;

    // filtro testo
    const q = (App.filters[key] || '').toLowerCase().trim();
    if (q) {
      rows = rows.filter(r => cfg.fields.some(f => String(r[f.name] || '').toLowerCase().includes(q)));
    }

    // conta figli per riga
    const childCounts = {};
    if (cfg.child) {
      const childRows = await DB.all(cfg.child.store);
      const fk = childFk(cfg.store);
      childRows.forEach(c => { childCounts[c[fk]] = (childCounts[c[fk]] || 0) + 1; });
    }

    let html = `<div class="mb-3">
      <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
        <div>
          <h4 class="mb-0">${esc(cfg.title)}</h4>
          ${parentRow ? `<small class="text-muted">${esc(cfg.parent.label)}: <strong>${esc(parentRow[cfg.parent.labelField])}</strong>
            <a href="#" class="ms-2" data-clearparent="1">↑ mostra tutti</a></small>` : ''}
        </div>
        <button class="btn btn-primary btn-sm flex-shrink-0" id="add-${key}">+ Nuova ${esc(cfg.singular)}</button>
      </div>
      <input type="search" class="form-control form-control-sm" style="max-width:320px" placeholder="🔎 Filtra…" id="flt-${key}" value="${esc(App.filters[key] || '')}">
    </div>`;

    html += `<div class="table-responsive"><table class="table table-hover table-sm align-middle bg-white">
      <thead class="table-light"><tr>`;
    if (cfg.parent) html += `<th>${esc(cfg.parent.label)}</th>`;
    cfg.fields.filter(f => f.col).forEach(f => html += `<th>${esc(f.label)}</th>`);
    if (cfg.child) html += `<th class="text-center">${esc(cfg.child.label)}</th>`;
    html += `<th class="text-end">Azioni</th></tr></thead><tbody>`;

    if (!rows.length) {
      const span = cfg.fields.filter(f => f.col).length + 2 + (cfg.parent ? 1 : 0);
      html += `<tr><td colspan="${span}" class="text-center text-muted py-4">Nessun elemento. Usa "+ Nuova ${esc(cfg.singular)}".</td></tr>`;
    }
    rows.forEach(r => {
      html += '<tr>';
      if (cfg.parent) {
        const p = pmap[r[cfg.parent.fk]];
        html += `<td>${p ? esc(p[cfg.parent.labelField]) : '<span class="text-danger">—</span>'}</td>`;
      }
      cfg.fields.filter(f => f.col).forEach(f => {
        let v = r[f.name];
        if (f.name === 'ancorato' && v) v = v === 'SI' ? '<span class="badge bg-success">SI</span>' : '<span class="badge bg-danger">NO</span>';
        html += `<td>${f.name === 'ancorato' ? (v || '—') : esc(v || '—')}</td>`;
      });
      if (cfg.child) {
        const c = childCounts[r.id] || 0;
        html += `<td class="text-center"><a href="#" class="badge bg-secondary text-decoration-none" data-child="${esc(r.id)}">${c} ›</a></td>`;
      }
      html += `<td class="text-end text-nowrap">
        <button class="btn btn-outline-secondary btn-sm" data-edit="${esc(r.id)}">Modifica</button>
        <button class="btn btn-outline-danger btn-sm" data-del="${esc(r.id)}">Elimina</button>
      </td></tr>`;
    });
    html += '</tbody></table></div>';
    main.innerHTML = html;

    // eventi
    document.getElementById('add-' + key).onclick = () => editForm(key, null, parentRow);
    const flt = document.getElementById('flt-' + key);
    flt.oninput = debounce(() => { App.filters[key] = flt.value; renderResource(key); }, 250);
    main.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editForm(key, b.dataset.edit));
    main.querySelectorAll('[data-del]').forEach(b => b.onclick = () => delRow(key, b.dataset.del));
    main.querySelectorAll('[data-child]').forEach(b => b.onclick = (e) => {
      e.preventDefault();
      navChild(cfg.child.store, childFk(cfg.store), b.dataset.child);
    });
    const cp = main.querySelector('[data-clearparent]');
    if (cp) cp.onclick = (e) => { e.preventDefault(); App.params = {}; renderResource(key); };
  }

  function childFk(parentStore) {
    return { sedi: 'idSede', edifici: 'idEdificio', piani: 'idPiano', ambienti: 'idAmbiente', beni: 'idBene' }[parentStore];
  }

  function navChild(store, fk, parentId) {
    App.params = {}; App.params[fk] = parentId;
    if (store === 'verifiche') { go('verifiche', { idBene: parentId }); return; }
    go(store, App.params);
  }

  // ---------- Form add/edit ----------
  async function editForm(key, id, presetParent) {
    const cfg = RES[key];
    let row = id ? await DB.get(cfg.store, id) : {};
    let parentSelect = '';
    if (cfg.parent) {
      const parents = await DB.all(cfg.parent.store);
      const cur = row[cfg.parent.fk] || (presetParent ? presetParent.id : (App.params[cfg.parent.fk] || ''));
      const opts = parents.map(p => ({ value: p.id, label: p[cfg.parent.labelField] + (p.codice && p.codice !== p[cfg.parent.labelField] ? ' (' + p.codice + ')' : '') }));
      parentSelect = `<div class="col-12"><label class="form-label">${esc(cfg.parent.label)} *</label>
        <select class="form-select" name="${cfg.parent.fk}" required>
          <option value="">— seleziona —</option>${options(opts, cur)}</select></div>`;
    }
    const body = `<form id="entity-form" class="row g-3">${parentSelect}${cfg.fields.map(f => fieldHtml(f, row)).join('')}</form>`;
    const res = await modal({
      title: (id ? 'Modifica ' : 'Nuova ') + cfg.singular, body,
      onValidate: (w) => {
        const form = w.querySelector('#entity-form');
        if (!form.checkValidity()) { form.reportValidity(); return false; }
        return true;
      }
    });
    if (!res) return;
    const form = res.querySelector('#entity-form');
    const obj = id ? row : {};
    if (cfg.parent) obj[cfg.parent.fk] = form.elements[cfg.parent.fk].value;
    cfg.fields.forEach(f => {
      const el = form.elements[f.name];
      obj[f.name] = f.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
    });
    await DB.put(cfg.store, obj);
    toast(cfg.singular + (id ? ' aggiornata/o.' : ' creata/o.'), 'success');
    renderResource(key);
  }

  function fieldHtml(f, row) {
    const v = row[f.name] !== undefined ? row[f.name] : '';
    const req = f.required ? 'required' : '';
    const width = (f.type === 'textarea') ? 'col-12' : 'col-md-6';
    let input;
    if (f.type === 'textarea') {
      input = `<textarea class="form-control" name="${f.name}" rows="2">${esc(v)}</textarea>`;
    } else if (f.type === 'select') {
      const opts = f.opts();
      input = `<select class="form-select" name="${f.name}" ${req}>${options(opts, v)}</select>`;
    } else if (f.type === 'number') {
      input = `<input type="number" step="any" class="form-control" name="${f.name}" value="${esc(v)}" ${req}>`;
    } else {
      input = `<input type="text" class="form-control" name="${f.name}" value="${esc(v)}" ${req}>`;
    }
    return `<div class="${width}"><label class="form-label">${esc(f.label)}${f.required ? ' *' : ''}</label>${input}</div>`;
  }

  async function delRow(key, id) {
    const cfg = RES[key];
    const ok = await confirmDialog(`Eliminare questa ${cfg.singular}? Verranno rimossi anche tutti gli elementi collegati (a cascata).`, 'Elimina');
    if (!ok) return;
    await DB.removeCascade(cfg.store, id);
    toast(cfg.singular + ' eliminata/o.', 'danger');
    renderResource(key);
  }

  // ---------- Navigazione ----------
  function go(view, params) {
    App.view = view;
    App.params = params || {};
    document.querySelectorAll('#sidebar .nav-link').forEach(a =>
      a.classList.toggle('active', a.dataset.view === view));
    render();
    window.scrollTo(0, 0);
    closeDrawer();
  }

  // menù a scomparsa (mobile)
  function openDrawer() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('menu-backdrop').classList.add('show');
  }
  function closeDrawer() {
    const sb = document.getElementById('sidebar'); if (sb) sb.classList.remove('open');
    const bd = document.getElementById('menu-backdrop'); if (bd) bd.classList.remove('show');
  }
  global.go = go;

  async function render() {
    const v = App.view;
    if (RES[v]) return renderResource(v);
    if (v === 'dashboard') return Dashboard.render();
    if (v === 'verifiche') return Verifiche.render();
    if (v === 'nonconformita') return NC.render();
    if (v === 'figure') return Figure.render();
    if (v === 'report') return Reports.renderPage();
    if (v === 'normativa') return renderNormativa();
    if (v === 'backup') return renderBackup();
    if (v === 'guida') return renderGuida();
  }
  global.renderApp = render;

  // ---------- Normativa ----------
  function renderNormativa() {
    const main = document.getElementById('main');
    let html = `<h4 class="mb-3">Riferimenti normativi — D.Lgs. 81/2008</h4>
      <p class="text-muted">Testo di riferimento sintetico. Ogni checklist richiama gli articoli pertinenti.</p>
      <div class="accordion" id="accNorma">`;
    DATA.NORMATIVA.forEach((n, i) => {
      html += `<div class="accordion-item">
        <h2 class="accordion-header"><button class="accordion-button ${i ? 'collapsed' : ''}" type="button"
          data-bs-toggle="collapse" data-bs-target="#n${i}">
          <strong>${esc(n.art)}</strong>&nbsp;— ${esc(n.titolo)}</button></h2>
        <div id="n${i}" class="accordion-collapse collapse ${i === 0 ? 'show' : ''}" data-bs-parent="#accNorma">
          <div class="accordion-body">${esc(n.testo)}</div>
        </div></div>`;
    });
    html += '</div>';
    main.innerHTML = html;
  }

  // ---------- Backup ----------
  function renderBackup() {
    const main = document.getElementById('main');
    const op = DB.getOperatore();
    main.innerHTML = `
      <h4 class="mb-3">Backup e Riconciliazione</h4>
      <div class="row g-3">
        <div class="col-12">
          <div class="card border-success"><div class="card-body d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div><h6 class="mb-0">👤 Operatore corrente: <span class="badge bg-success">${esc(op.codice)}</span> ${esc(op.nome || '')}</h6>
              <small class="text-muted">Ogni dato che inserisci è marcato con questo codice. Gli ID hanno il prefisso <code>${esc(op.codice)}-</code>.</small></div>
            <button class="btn btn-outline-secondary btn-sm" id="bk-op">Cambia operatore</button>
          </div></div>
        </div>
        <div class="col-md-6">
          <div class="card h-100"><div class="card-body">
            <h5 class="card-title">💾 Backup database</h5>
            <p class="text-muted">Esporta l'intero database in un file JSON (anagrafiche, verifiche, NC, figure e allegati). Il nome file include il codice operatore.</p>
            <button class="btn btn-primary" id="bk-export">Scarica backup (.json)</button>
          </div></div>
        </div>
        <div class="col-md-6">
          <div class="card h-100"><div class="card-body">
            <h5 class="card-title">♻️ Riconciliazione / Ripristino</h5>
            <p class="text-muted mb-2"><strong>Unisci</strong> = riconcilia uno o più backup di altri operatori (vince la versione più recente, con report). <strong>Sostituisci</strong> = azzera e ricarica da un solo file.</p>
            <input type="file" class="form-control mb-2" id="bk-file" accept="application/json,.json" multiple>
            <div class="btn-group">
              <button class="btn btn-success" id="bk-merge">Unisci (riconcilia)</button>
              <button class="btn btn-outline-danger" id="bk-replace">Sostituisci</button>
            </div>
          </div></div>
        </div>
        <div class="col-md-6">
          <div class="card h-100 border-info"><div class="card-body">
            <h5 class="card-title">🧪 Dati dimostrativi</h5>
            <p class="text-muted">Carica un set di esempio (sedi, ambienti, beni, verifiche, NC, figure) per provare il flusso di lavoro. Vengono marcati con l'operatore corrente.</p>
            <button class="btn btn-outline-info" id="bk-demo">Carica dati dimostrativi</button>
          </div></div>
        </div>
        <div class="col-md-6">
          <div class="card border-danger h-100"><div class="card-body">
            <h5 class="card-title text-danger">Azzeramento totale</h5>
            <p class="text-muted">Elimina tutti i dati da questo dispositivo (l'operatore resta impostato).</p>
            <button class="btn btn-outline-danger" id="bk-wipe">Cancella tutti i dati</button>
          </div></div>
        </div>
      </div>`;
    document.getElementById('bk-op').onclick = () => ensureOperatore(true);
    document.getElementById('bk-export').onclick = Exports.backup;
    const fileEl = document.getElementById('bk-file');
    document.getElementById('bk-replace').onclick = () => Exports.restore(fileEl, 'replace');
    document.getElementById('bk-merge').onclick = () => Exports.restore(fileEl, 'merge');
    document.getElementById('bk-demo').onclick = async () => {
      if (!await confirmDialog('Caricare i dati dimostrativi? Verranno aggiunti a quelli esistenti.', 'Carica')) return;
      const n = await seedDemo();
      toast('Dati dimostrativi caricati (' + n + ' record).', 'success');
      go('dashboard');
    };
    document.getElementById('bk-wipe').onclick = async () => {
      if (!await confirmDialog('Cancellare DEFINITIVAMENTE tutti i dati? Operazione irreversibile.', 'Cancella tutto')) return;
      for (const s of Object.keys(DB.STORES)) if (s !== 'meta') await DB.clear(s);
      toast('Database azzerato.', 'danger');
      go('dashboard');
    };
  }

  // ---------- Operatore (perno del DB) ----------
  async function loadOperatore() {
    const m = await DB.get('meta', 'operatore');
    if (m && m.valore && m.valore.codice) { DB.setOperatore(m.valore); return m.valore; }
    return null;
  }

  async function ensureOperatore(force) {
    const cur = DB.getOperatore();
    const has = cur && cur.codice && cur.codice !== 'NA';
    if (has && !force) return cur;
    const res = await modal({
      title: 'Identifica operatore', size: 'md', okText: 'Conferma', hideCancel: !has,
      body: `<p class="text-muted small">L'operatore è il perno del database: marca ogni dato inserito e distingue le copie usate da persone diverse. Usa un <strong>codice breve e univoco</strong> (es. le tue iniziali).</p>
        <form id="op-form" class="row g-3">
          <div class="col-md-5"><label class="form-label">Codice operatore *</label>
            <input class="form-control text-uppercase" name="codice" maxlength="8" placeholder="es. MR" value="${esc(has ? cur.codice : '')}" required></div>
          <div class="col-md-7"><label class="form-label">Nome e cognome</label>
            <input class="form-control" name="nome" placeholder="es. Mario Rossi" value="${esc(has ? cur.nome : '')}"></div>
        </form>`,
      onValidate: (w) => {
        const f = w.querySelector('#op-form');
        const c = f.codice.value.trim();
        if (!c) { f.reportValidity(); return false; }
        return true;
      }
    });
    if (!res) return cur;
    const f = res.querySelector('#op-form');
    const op = { codice: f.codice.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''), nome: f.nome.value.trim() };
    DB.setOperatore(op);
    await DB.put('meta', { chiave: 'operatore', valore: op });
    renderOperatoreChip();
    toast('Operatore impostato: ' + op.codice, 'success');
    if (App.view === 'backup') renderBackup();
    return op;
  }

  function renderOperatoreChip() {
    const el = document.getElementById('op-chip');
    if (el) { const op = DB.getOperatore(); el.textContent = '👤 ' + op.codice; el.title = 'Operatore: ' + (op.nome || op.codice); }
  }
  global.ensureOperatore = ensureOperatore;

  // ---------- Dati dimostrativi ----------
  async function seedDemo() {
    let n = 0; const A = async (s, o) => { await DB.add(s, o); n++; return o; };
    const oggi = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    const meno = (g) => iso(new Date(oggi.getTime() - g * 86400000));
    const piu = (g) => iso(new Date(oggi.getTime() + g * 86400000));

    const sede = await A('sedi', { codice: 'SE-DEMO', nome: 'Comune di Esempio — Sede Centrale', indirizzo: 'Piazza Municipio 1', responsabile: 'Dott. Giovanni Neri', note: 'Dati dimostrativi' });
    const edi = await A('edifici', { idSede: sede.id, nome: 'Palazzo Uffici', descrizione: 'Uffici amministrativi e archivi' });
    const p0 = await A('piani', { idEdificio: edi.id, numero: '0', descrizione: 'Piano terra' });
    const p1 = await A('piani', { idEdificio: edi.id, numero: '1', descrizione: 'Primo piano' });

    const archivio = await A('ambienti', { idPiano: p0.id, codice: 'ARCH-01', tipologia: 'Archivio', responsabile: 'L. Bianchi', superficie: 65, note: 'Archivio di deposito atti' });
    const ced = await A('ambienti', { idPiano: p0.id, codice: 'CED-01', tipologia: 'CED', responsabile: 'M. Conti', superficie: 20 });
    const ufficio = await A('ambienti', { idPiano: p1.id, codice: 'UFF-12', tipologia: 'Ufficio', responsabile: 'A. Verdi', superficie: 30 });

    const sc1 = await A('beni', { idAmbiente: archivio.id, codice: 'SC-001', categoria: 'Scaffalatura metallica', descrizione: 'Scaffalatura archivio fila A', marca: 'Metalsistem', modello: 'Super123', anno: 2016, altezza: 250, portata: 200, ancorato: 'SI', stato: 'In uso' });
    const sc2 = await A('beni', { idAmbiente: archivio.id, codice: 'SC-002', categoria: 'Scaffalatura metallica', descrizione: 'Scaffalatura archivio fila B', marca: 'Metalsistem', anno: 2012, altezza: 250, portata: 200, ancorato: 'NO', stato: 'Da verificare' });
    const rack = await A('beni', { idAmbiente: ced.id, codice: 'RK-01', categoria: 'Rack informatico', descrizione: 'Rack server 42U', marca: 'APC', ancorato: 'SI', stato: 'In uso' });
    const arm = await A('beni', { idAmbiente: ufficio.id, codice: 'AR-050', categoria: 'Armadio', descrizione: 'Armadio metallico documenti', altezza: 200, ancorato: 'NO', stato: 'In uso' });

    // verifiche
    const v1 = await A('verifiche', {
      idBene: sc1.id, idAmbiente: archivio.id, tipoChecklist: 'scaffalature', tipoIspezione: 'Ispezione approfondita (tecnico esterno)',
      data: meno(20), verificatore: 'Ing. Rossi', esito: 'Conforme', classeDanno: 'Verde', prossimaVerifica: piu(345),
      checklist: { 'Documentazione disponibile': 'si', 'Corretto montaggio': 'si', 'Corretto ancoraggio': 'si', 'Verticalità e allineamento montanti': 'si', 'Portata leggibile': 'si', 'Assenza sovraccarichi': 'si' }, note: 'Struttura in buono stato.'
    });
    const v2 = await A('verifiche', {
      idBene: sc2.id, idAmbiente: archivio.id, tipoChecklist: 'scaffalature', tipoIspezione: 'Ispezione approfondita (tecnico esterno)',
      data: meno(15), verificatore: 'Ing. Rossi', esito: 'Non conforme', classeDanno: 'Rosso', prossimaVerifica: meno(2),
      checklist: { 'Corretto ancoraggio': 'no', 'Serraggio tasselli/bulloni di fissaggio': 'no', 'Assenza deformazioni': 'no', 'Integrità gancetti di sicurezza correnti': 'no' }, note: 'Montante deformato da urto, manca ancoraggio a parete.'
    });
    await A('verifiche', {
      idBene: arm.id, idAmbiente: ufficio.id, tipoChecklist: 'arredi', tipoIspezione: 'Controllo visivo',
      data: meno(10), verificatore: 'P. Preposto', esito: 'Conforme con prescrizioni', prossimaVerifica: piu(355),
      checklist: { 'Stabilità': 'si', 'Assenza ribaltamento': 'no', 'Fissaggi adeguati': 'no' }, note: 'Armadio alto non fissato a parete: consigliato fissaggio.'
    });
    await A('verifiche', {
      idAmbiente: ced.id, tipoChecklist: 'ambienti', tipoIspezione: 'Ispezione sistematica interna',
      data: meno(5), verificatore: 'RSPP', esito: 'Conforme', prossimaVerifica: piu(180),
      checklist: { 'Vie di esodo libere': 'si', 'Estintori accessibili': 'si', 'Illuminazione emergenza funzionante': 'si', 'Nessun deposito improprio': 'si' }
    });

    // NC dalla verifica Rossa
    await A('nonconformita', {
      numero: 'NC-' + oggi.getFullYear() + '-001', dataApertura: meno(15), idVerifica: v2.id, idBene: sc2.id, idAmbiente: archivio.id,
      descrizione: 'Scaffalatura SC-002: montante deformato e assenza di ancoraggio. Classificazione UNI EN 15635: Rosso.',
      livelloRischio: 'Alto', misure: ['Interdizione area', 'Sospensione utilizzo'], responsabile: 'Ufficio Tecnico', dataPrevista: meno(1), stato: 'In corso'
    });

    // figure
    await A('figure', { ruolo: 'Datore di Lavoro', nominativo: 'Dott. Giovanni Neri', qualifica: 'Segretario Generale', idSede: sede.id });
    await A('figure', { ruolo: 'RSPP - Responsabile SPP', nominativo: 'Ing. Anna Gialli', qualifica: 'Servizio Prevenzione', idSede: '' });
    await A('figure', { ruolo: 'Medico Competente', nominativo: 'Dr.ssa Sara Blu', idSede: '' });
    await A('figure', { ruolo: 'PRSES - Resp. Sicurezza Attrezzature Stoccaggio', nominativo: 'Geom. Luca Ferri', qualifica: 'Responsabile magazzino/archivi', idSede: sede.id });
    await A('figure', { ruolo: 'RLS - Rappresentante Lavoratori Sicurezza', nominativo: 'Sig. Marco Russo', idSede: sede.id });

    return n;
  }
  global.seedDemo = seedDemo;

  // ---------- Guida al flusso di lavoro ----------
  function renderGuida() {
    const op = DB.getOperatore();
    const main = document.getElementById('main');
    const step = (num, tit, body) => `<div class="col-12"><div class="card"><div class="card-body">
      <h6 class="mb-2"><span class="badge bg-success me-2">${num}</span>${tit}</h6>${body}</div></div></div>`;
    main.innerHTML = `
      <h4 class="mb-3">Guida al flusso di lavoro</h4>
      <p class="text-muted">Operatore corrente: <span class="badge bg-success">${esc(op.codice)}</span> ${esc(op.nome || '')}.
        Puoi caricare un set di prova da <a href="#" id="g-demo">Backup → Dati dimostrativi</a>.</p>
      <div class="row g-3">
        ${step('1', 'Identifica l\'operatore', `<p class="mb-0">Al primo avvio imposti un <strong>codice operatore</strong> (es. le tue iniziali). Da quel momento <strong>ogni record che crei</strong> è marcato con autore, data di creazione e ultima modifica, e gli <strong>ID</strong> ricevono il prefisso <code>${esc(op.codice)}-</code>. È ciò che rende possibile lavorare in più persone senza collisioni.</p>`)}
        ${step('2', 'Censisci la struttura', '<p class="mb-0">Inserisci in ordine gerarchico: <strong>Sedi → Edifici → Piani → Ambienti → Beni</strong>. Ogni livello ha il pulsante “+” e il conteggio dei figli per navigare in profondità. Registra scaffalature, armadi, rack, ecc. con codice identificativo, portata, ancoraggio e stato.</p>')}
        ${step('3', 'Registra la squadra (Figure)', '<p class="mb-0">In <strong>Figure sicurezza</strong> inserisci Datore di Lavoro, RSPP, Medico Competente, RLS, Preposti e il <strong>PRSES</strong> (responsabile scaffalature ex UNI EN 15635). Compaiono nell’organigramma della relazione.</p>')}
        ${step('4', 'Esegui le verifiche sul campo', '<p class="mb-0">In <strong>Verifiche</strong> apri una verifica su un bene o un ambiente: compili la <strong>checklist</strong>, l’<strong>esito</strong>, per le scaffalature la <strong>classe di danno 🟢🟡🔴</strong> e la <strong>prossima verifica</strong>. <strong>Scatti le foto</strong> (📷) e aggiungi la <strong>descrizione</strong> di ciò che osservi: le ritroverai nella relazione.</p>')}
        ${step('5', 'Gestisci le non conformità', '<p class="mb-0">Un esito critico propone l’apertura di una <strong>Non Conformità</strong>: rischio, misure immediate, responsabile e scadenza vengono precompilati (Rosso→azione immediata, Giallo→30 giorni). Aggiorni lo stato fino a <em>Chiusa</em>.</p>')}
        ${step('6', 'Produci i documenti', '<p class="mb-0">In <strong>Report</strong> generi verbali PDF (con foto), organigramma, elenco NC, piano azioni e la <strong>Relazione finale in Word (.docx)</strong> con la documentazione fotografica, da rifinire prima dell’invio.</p>')}
        ${step('7', 'Lavoro in più persone e riconciliazione', `<p class="mb-1">Per lavorare in team, restando 100% offline:</p>
          <ol class="mb-0">
            <li>Un referente prepara un <strong>backup di base</strong> (Backup → Scarica) e lo distribuisce.</li>
            <li>Ogni operatore imposta il <strong>proprio codice</strong> e lavora su <strong>sedi/aree diverse</strong> (per evitare doppioni).</li>
            <li>Ognuno esporta il proprio <strong>backup</strong>.</li>
            <li>Il referente li importa con <strong>Unisci (riconcilia)</strong>: puoi selezionare più file insieme. Vince sempre la <strong>versione più recente</strong> e ottieni un <strong>report</strong> (aggiunti / aggiornati / invariati / conflitti).</li>
          </ol>`)}
      </div>`;
    const gd = document.getElementById('g-demo');
    if (gd) gd.onclick = (e) => { e.preventDefault(); go('backup'); };
  }

  // ---------- Ricerca globale ----------
  async function globalSearch(q) {
    q = q.toLowerCase().trim();
    const box = document.getElementById('search-results');
    if (!q) { box.classList.add('d-none'); box.innerHTML = ''; return; }
    const [sedi, ambienti, beni, verifiche, nc] = await Promise.all([
      DB.all('sedi'), DB.all('ambienti'), DB.all('beni'), DB.all('verifiche'), DB.all('nonconformita')
    ]);
    const hits = [];
    const match = (r, fields) => fields.some(f => String(r[f] || '').toLowerCase().includes(q));
    sedi.filter(r => match(r, ['nome', 'codice', 'responsabile', 'indirizzo'])).slice(0, 5)
      .forEach(r => hits.push({ t: 'Sede', l: r.nome, act: () => go('sedi') }));
    ambienti.filter(r => match(r, ['codice', 'tipologia', 'responsabile'])).slice(0, 5)
      .forEach(r => hits.push({ t: 'Ambiente', l: r.codice + ' · ' + (r.tipologia || ''), act: () => go('ambienti') }));
    beni.filter(r => match(r, ['codice', 'categoria', 'descrizione', 'marca', 'modello'])).slice(0, 8)
      .forEach(r => hits.push({ t: 'Bene', l: r.codice + ' · ' + (r.categoria || ''), act: () => go('verifiche', { idBene: r.id }) }));
    nc.filter(r => match(r, ['numero', 'descrizione', 'stato'])).slice(0, 5)
      .forEach(r => hits.push({ t: 'NC', l: (r.numero || '') + ' · ' + (r.stato || ''), act: () => go('nonconformita') }));

    if (!hits.length) { box.innerHTML = '<div class="list-group-item text-muted small">Nessun risultato</div>'; box.classList.remove('d-none'); return; }
    box.innerHTML = hits.map((h, i) =>
      `<button class="list-group-item list-group-item-action py-1" data-h="${i}">
        <span class="badge bg-secondary me-2">${esc(h.t)}</span>${esc(h.l)}</button>`).join('');
    box.classList.remove('d-none');
    box.querySelectorAll('[data-h]').forEach(b => b.onclick = () => {
      box.classList.add('d-none'); document.getElementById('global-search').value = '';
      hits[Number(b.dataset.h)].act();
    });
  }
  global.globalSearch = globalSearch;

  function debounce(fn, ms) {
    let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(null, a), ms); };
  }
  global.debounce = debounce;

  // ---------- Bootstrap dell'app ----------
  document.addEventListener('DOMContentLoaded', async () => {
    await DB.open();
    // navigazione sidebar
    document.querySelectorAll('#sidebar .nav-link').forEach(a => {
      a.onclick = (e) => { e.preventDefault(); go(a.dataset.view); };
    });
    // menù a scomparsa mobile (gestione custom)
    document.getElementById('menu-toggle').onclick = openDrawer;
    document.getElementById('menu-close').onclick = closeDrawer;
    document.getElementById('menu-backdrop').onclick = closeDrawer;
    // versione visibile (subito la costante, poi quella realmente in cache)
    const vEl = document.getElementById('app-version');
    if (vEl) {
      vEl.textContent = APP_VERSION;
      if ('caches' in window) caches.keys().then(ks => {
        const vers = ks.map(k => (k.match(/sicurezza81-v(\d+)/) || [])[1]).filter(Boolean).map(Number);
        if (vers.length) vEl.textContent = 'v' + Math.max(...vers);
      }).catch(() => {});
    }
    // chip operatore in topbar
    const chip = document.getElementById('op-chip');
    if (chip) chip.onclick = () => ensureOperatore(true);
    // ricerca globale
    const gs = document.getElementById('global-search');
    gs.oninput = debounce(() => globalSearch(gs.value), 200);
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#search-wrap')) document.getElementById('search-results').classList.add('d-none');
    });

    // operatore = perno del DB: carica, oppure assegna un default (NON bloccante).
    // Evita che un modale iniziale copra l'app; l'operatore si cambia dal pulsante 👤.
    let op = await loadOperatore();
    let opAuto = false;
    if (!op) {
      op = { codice: 'OP1', nome: '' };
      DB.setOperatore(op);
      await DB.put('meta', { chiave: 'operatore', valore: op });
      opAuto = true;
    }
    renderOperatoreChip();
    go('dashboard');
    if (opAuto) setTimeout(() => toast('Operatore impostato automaticamente: OP1. Per il lavoro in più persone puoi cambiarlo dal pulsante 👤 in alto.', 'primary'), 900);

    // service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  });
})(window);
