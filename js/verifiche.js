/* ============================================================
   verifiche.js — Modulo Verifiche (checklist, esiti, allegati)
   ============================================================ */
(function (global) {
  'use strict';
  const { esc, toast, modal, confirmDialog, esitoBadge, fmtDate, options, fileToDataURL, bytesHuman } = U;

  // Ricostruisce il percorso gerarchico di un bene/ambiente per visualizzazione
  async function pathOfAmbiente(idAmbiente) {
    const amb = await DB.get('ambienti', idAmbiente); if (!amb) return { amb: null, label: '—' };
    const piano = await DB.get('piani', amb.idPiano);
    const edi = piano ? await DB.get('edifici', piano.idEdificio) : null;
    const sede = edi ? await DB.get('sedi', edi.idSede) : null;
    const label = [sede && sede.nome, edi && edi.nome, piano && ('P' + piano.numero), amb.codice].filter(Boolean).join(' › ');
    return { amb, piano, edi, sede, label };
  }

  async function contextOfVerifica(v) {
    if (v.idBene) {
      const bene = await DB.get('beni', v.idBene);
      const p = bene ? await pathOfAmbiente(bene.idAmbiente) : { label: '—' };
      return { bene, ambiente: p.amb, label: (p.label || '—') + (bene ? ' › ' + bene.codice : ''), sede: p.sede };
    }
    const p = await pathOfAmbiente(v.idAmbiente);
    return { bene: null, ambiente: p.amb, label: p.label, sede: p.sede };
  }
  global.contextOfVerifica = contextOfVerifica;
  global.pathOfAmbiente = pathOfAmbiente;

  async function render() {
    const main = document.getElementById('main');
    let verifiche = await DB.all('verifiche');
    verifiche.sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    let focusBene = null;
    if (App.params.idBene) {
      focusBene = await DB.get('beni', App.params.idBene);
      verifiche = verifiche.filter(v => v.idBene === App.params.idBene);
    }

    // filtro esito
    const fEsito = App.filters.vEsito || '';
    if (fEsito) verifiche = verifiche.filter(v => v.esito === fEsito);

    const ncAll = await DB.all('nonconformita');
    const ncByV = {};
    ncAll.forEach(n => { (ncByV[n.idVerifica] = ncByV[n.idVerifica] || []).push(n); });

    let html = `<div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
      <div><h4 class="mb-0">Verifiche</h4>
        ${focusBene ? `<small class="text-muted">Bene: <strong>${esc(focusBene.codice)}</strong>
          <a href="#" id="v-clear" class="ms-2">↑ mostra tutte</a></small>` : ''}</div>
      <div class="d-flex gap-2">
        <select class="form-select form-select-sm" id="v-flt" style="width:180px">
          ${options([{ value: '', label: 'Tutti gli esiti' }].concat(DATA.ESITI.map(e => ({ value: e, label: e }))), fEsito)}
        </select>
        <button class="btn btn-outline-primary btn-sm" id="v-amb">+ Verifica ambiente</button>
        <button class="btn btn-primary btn-sm" id="v-add">+ Verifica bene</button>
      </div></div>`;

    html += `<div class="table-responsive"><table class="table table-hover table-sm align-middle bg-white">
      <thead class="table-light"><tr>
        <th>Data</th><th>Oggetto</th><th>Ubicazione</th><th>Verificatore</th>
        <th>Esito</th><th>Classe danno</th><th>Prossima</th><th class="text-center">NC</th><th class="text-end">Azioni</th></tr></thead><tbody>`;
    if (!verifiche.length) html += `<tr><td colspan="9" class="text-center text-muted py-4">Nessuna verifica registrata.</td></tr>`;
    for (const v of verifiche) {
      const ctx = await contextOfVerifica(v);
      const ncs = ncByV[v.id] || [];
      const scaduta = v.prossimaVerifica && v.prossimaVerifica < U.todayISO();
      html += `<tr>
        <td>${fmtDate(v.data)}${v.tipoIspezione ? `<div class="small text-muted">${esc(v.tipoIspezione)}</div>` : ''}</td>
        <td>${ctx.bene ? esc(ctx.bene.codice) : '<span class="badge bg-info text-dark">Ambiente</span> ' + esc(ctx.ambiente ? ctx.ambiente.codice : '')}
          <div class="small text-muted">${esc(DATA.CHECKLIST[v.tipoChecklist] ? DATA.CHECKLIST[v.tipoChecklist].titolo.replace('Checklist ', '') : '')}</div></td>
        <td class="small">${esc(ctx.label)}</td>
        <td>${esc(v.verificatore || '—')}</td>
        <td>${esitoBadge(v.esito)}</td>
        <td>${v.tipoChecklist === 'scaffalature' ? U.classeDannoBadge(v.classeDanno) : '<span class="text-muted">n/a</span>'}</td>
        <td class="small">${v.prossimaVerifica ? (scaduta ? '<span class="text-danger fw-semibold">' + fmtDate(v.prossimaVerifica) + '</span>' : fmtDate(v.prossimaVerifica)) : '—'}</td>
        <td class="text-center">${ncs.length ? `<span class="badge bg-danger">${ncs.length}</span>` : '—'}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-outline-secondary btn-sm" data-open="${esc(v.id)}">Apri</button>
          <button class="btn btn-outline-danger btn-sm" data-del="${esc(v.id)}">Elimina</button>
        </td></tr>`;
    }
    html += '</tbody></table></div>';
    main.innerHTML = html;

    document.getElementById('v-add').onclick = () => pickBeneAndVerify();
    document.getElementById('v-amb').onclick = () => pickAmbienteAndVerify();
    document.getElementById('v-flt').onchange = (e) => { App.filters.vEsito = e.target.value; render(); };
    const cl = document.getElementById('v-clear');
    if (cl) cl.onclick = (e) => { e.preventDefault(); App.params = {}; render(); };
    main.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openVerifica(b.dataset.open));
    main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!await confirmDialog('Eliminare la verifica e le NC collegate?', 'Elimina')) return;
      await DB.removeCascade('verifiche', b.dataset.del);
      toast('Verifica eliminata.', 'danger'); render();
    });
  }

  // ---- selezione bene ----
  async function pickBeneAndVerify() {
    if (App.params.idBene) return newVerifica({ idBene: App.params.idBene });
    const beni = await DB.all('beni');
    if (!beni.length) { toast('Nessun bene censito. Aggiungi prima un bene.', 'warning'); return; }
    const opts = [];
    for (const b of beni) {
      const p = await pathOfAmbiente(b.idAmbiente);
      opts.push({ value: b.id, label: b.codice + ' — ' + (b.categoria || '') + ' (' + p.label + ')' });
    }
    const res = await modal({
      title: 'Seleziona bene da verificare', size: 'md',
      body: `<label class="form-label">Bene</label><select class="form-select" id="pk">${options(opts)}</select>`,
      okText: 'Prosegui'
    });
    if (!res) return;
    newVerifica({ idBene: res.querySelector('#pk').value });
  }

  async function pickAmbienteAndVerify() {
    const amb = await DB.all('ambienti');
    if (!amb.length) { toast('Nessun ambiente censito.', 'warning'); return; }
    const opts = [];
    for (const a of amb) {
      const p = await pathOfAmbiente(a.id);
      opts.push({ value: a.id, label: p.label });
    }
    const res = await modal({
      title: 'Seleziona ambiente da verificare', size: 'md',
      body: `<label class="form-label">Ambiente</label><select class="form-select" id="pk">${options(opts)}</select>`,
      okText: 'Prosegui'
    });
    if (!res) return;
    newVerifica({ idAmbiente: res.querySelector('#pk').value, tipoChecklist: 'ambienti' });
  }

  // ---- nuova / modifica verifica ----
  async function newVerifica(preset) {
    let tipo = preset.tipoChecklist;
    if (!tipo && preset.idBene) {
      const bene = await DB.get('beni', preset.idBene);
      tipo = DATA.checklistPerCategoria(bene.categoria);
    }
    const v = { idBene: preset.idBene || '', idAmbiente: preset.idAmbiente || '', tipoChecklist: tipo, data: U.todayISO(), verificatore: '', esito: '', checklist: {}, note: '' };
    if (preset.idBene && !v.idAmbiente) {
      const bene = await DB.get('beni', preset.idBene); v.idAmbiente = bene ? bene.idAmbiente : '';
    }
    editVerifica(v, true);
  }

  async function openVerifica(id) {
    const v = await DB.get('verifiche', id);
    editVerifica(v, false);
  }

  async function editVerifica(v, isNew) {
    const ctx = await contextOfVerifica(v);
    const cl = DATA.CHECKLIST[v.tipoChecklist];
    const isScaff = v.tipoChecklist === 'scaffalature';
    const checklistHtml = cl.voci.map((voce, i) => {
      const val = (v.checklist || {})[voce] || '';
      return `<tr>
        <td class="small">${esc(voce)}</td>
        <td class="text-center">${radio3('c' + i, voce, val)}</td>
      </tr>`;
    }).join('');

    const body = `
      <div class="alert alert-light border py-2 small mb-3">
        <div><strong>Oggetto:</strong> ${esc(ctx.label)}</div>
        <div><strong>Checklist:</strong> ${esc(cl.titolo)}</div>
        <div class="text-muted">${esc(cl.norma)}</div>
      </div>
      <form id="vform" class="row g-3">
        <div class="col-md-3"><label class="form-label">Data verifica *</label>
          <input type="date" class="form-control" name="data" value="${esc(v.data || U.todayISO())}" required></div>
        <div class="col-md-3"><label class="form-label">Verificatore *</label>
          <input type="text" class="form-control" name="verificatore" value="${esc(v.verificatore || '')}" required></div>
        <div class="col-md-3"><label class="form-label">Tipo di ispezione</label>
          <select class="form-select" name="tipoIspezione">${options([''].concat(DATA.TIPI_ISPEZIONE), v.tipoIspezione)}</select></div>
        <div class="col-md-3"><label class="form-label">Esito *</label>
          <select class="form-select" name="esito" required>${options([''].concat(DATA.ESITI), v.esito)}</select></div>
        ${isScaff ? `<div class="col-md-5"><label class="form-label">Classe di danno (UNI EN 15635)</label>
          <select class="form-select" name="classeDanno" id="classe-danno">${options([''].concat(Object.keys(DATA.CLASSI_DANNO)), v.classeDanno)}</select>
          <div class="form-text" id="classe-help">${v.classeDanno ? esc(DATA.CLASSI_DANNO[v.classeDanno].azione) : '🟢 monitoraggio · 🟡 intervento ≤30 gg · 🔴 fuori servizio immediato'}</div></div>` : ''}
        <div class="col-md-${isScaff ? '4' : '5'}"><label class="form-label">Prossima verifica prevista</label>
          <div class="input-group">
            <input type="date" class="form-control" name="prossimaVerifica" id="prossima-verifica" value="${esc(v.prossimaVerifica || '')}">
            <button type="button" class="btn btn-outline-secondary" id="btn-12m">+12 mesi</button>
          </div>
          <div class="form-text">UNI EN 15635: ispezione approfondita entro 12 mesi.</div></div>
        <div class="col-12 small" id="esito-hint"></div>
        <div class="col-12">
          <label class="form-label mb-1">${esc(cl.titolo)}</label>
          <table class="table table-sm table-bordered mb-1 checklist">
            <thead class="table-light"><tr><th>Requisito</th><th class="text-center" style="width:220px">Conforme / N.C. / N.A.</th></tr></thead>
            <tbody>${checklistHtml}</tbody>
          </table>
          <button type="button" class="btn btn-sm btn-outline-success" id="chk-all">Segna tutti conformi</button>
        </div>
        <div class="col-12"><label class="form-label">Note</label>
          <textarea class="form-control" name="note" rows="2">${esc(v.note || '')}</textarea></div>
      </form>
      ${isNew ? '' : `<hr><div id="alleg-box"></div>`}
    `;

    const res = await modal({
      title: (isNew ? 'Nuova verifica' : 'Verifica del ' + fmtDate(v.data)),
      body, size: 'lg', okText: 'Salva verifica',
      onShow: (w) => {
        // Stato visivo via stili inline: affidabile in ogni browser, indipendente
        // dal ridisegno del selettore CSS ":checked +".
        const COLORI = { si: '#198754', no: '#dc3545', na: '#6c757d' };
        const syncGroup = (grp) => {
          grp.querySelectorAll('label.btn').forEach(l => {
            const inp = l.previousElementSibling; // l'input .btn-check precede sempre la sua label
            if (inp && inp.checked) { l.style.backgroundColor = COLORI[inp.value]; l.style.color = '#fff'; l.style.borderColor = COLORI[inp.value]; }
            else { l.style.backgroundColor = ''; l.style.color = ''; l.style.borderColor = ''; }
          });
        };
        // --- Suggerimento esito allineato a norma (D.Lgs. 81 / UNI EN 15635) ---
        const esitoSel = w.querySelector('select[name="esito"]');
        const hint = w.querySelector('#esito-hint');
        const cd = w.querySelector('#classe-danno'); // solo scaffalature
        const MAP_CD = { 'Verde': 'Conforme', 'Giallo': 'Conforme con prescrizioni', 'Rosso': 'Non conforme' };
        const countNC = () => w.querySelectorAll('table.checklist input.btn-check[value="no"]:checked').length;
        const countAns = () => w.querySelectorAll('table.checklist input.btn-check:checked').length;
        const suggerito = () => {
          if (cd && cd.value && MAP_CD[cd.value]) return MAP_CD[cd.value]; // scaffalature: classe danno prevale
          if (countNC() > 0) return 'Non conforme';
          if (countAns() > 0) return 'Conforme';
          return '';
        };
        // suggerimento/avviso testuale accanto al menù Esito (l'utente sceglie dal menù)
        const updateHint = () => {
          const nc = countNC(), ans = countAns(), cur = esitoSel.value;
          let msg = '', cls = 'text-muted';
          if (cd && cd.value && cur && cur !== MAP_CD[cd.value]) {
            msg = '⚠ Classe di danno ' + cd.value + ' → esito atteso «' + MAP_CD[cd.value] + '» (UNI EN 15635).'; cls = 'text-danger fw-semibold';
          } else if (nc > 0 && cur === 'Conforme') {
            msg = '⚠ Ci sono ' + nc + ' requisiti N.C.: «Conforme» non è ammissibile — scegli «Non conforme» o «Conforme con prescrizioni».'; cls = 'text-danger fw-semibold';
          } else if (cur === 'Non conforme' && nc === 0 && ans > 0) {
            msg = 'ℹ Esito «Non conforme» senza requisiti N.C.: motiva nelle note.'; cls = 'text-muted';
          } else if (!cur && ans > 0) {
            const sug = suggerito();
            if (sug) { msg = '💡 Esito suggerito: «' + sug + '»' + (nc > 0 && !(cd && cd.value) ? ' (oppure «Conforme con prescrizioni»)' : '') + ' — selezionalo nel menù Esito.'; cls = 'text-primary'; }
          }
          hint.innerHTML = msg ? '<span class="' + cls + '">' + esc(msg) + '</span>' : '';
        };

        const groups = w.querySelectorAll('table.checklist .btn-group');
        groups.forEach(grp => {
          grp.querySelectorAll('input.btn-check').forEach(inp => inp.addEventListener('change', () => { syncGroup(grp); updateHint(); }));
          syncGroup(grp); // stato iniziale
        });
        w.querySelector('#chk-all').onclick = () => {
          groups.forEach(grp => { const si = grp.querySelector('input[value="si"]'); if (si) si.checked = true; syncGroup(grp); });
          updateHint();
        };
        esitoSel.onchange = updateHint;
        if (cd) cd.onchange = () => {
          const info = DATA.CLASSI_DANNO[cd.value];
          w.querySelector('#classe-help').textContent = info ? info.azione : '🟢 monitoraggio · 🟡 intervento ≤30 gg · 🔴 fuori servizio immediato';
          if (info && !esitoSel.value) esitoSel.value = MAP_CD[cd.value]; // se esito vuoto, precompila coerente
          updateHint();
        };
        updateHint();
        w.querySelector('#btn-12m').onclick = () => {
          const dataVal = w.querySelector('input[name="data"]').value || U.todayISO();
          w.querySelector('#prossima-verifica').value = U.addMonthsISO(dataVal, 12);
        };
        if (!isNew) renderAllegati(w.querySelector('#alleg-box'), 'verifiche', v.id);
      },
      onValidate: (w) => {
        const f = w.querySelector('#vform');
        if (!f.checkValidity()) { f.reportValidity(); return false; }
        // coerenza esito <-> checklist (norma: blocco solo l'incoerenza netta)
        const noSel = w.querySelectorAll('table.checklist input.btn-check[value="no"]:checked').length;
        const esito = f.esito.value;
        // Blocco netto: "Conforme" pieno non ammissibile con requisiti N.C.
        if (esito === 'Conforme' && noSel > 0) {
          U.toast('Incoerenza: esito "Conforme" con ' + noSel + ' requisito/i N.C. Usa "Non conforme" o "Conforme con prescrizioni".', 'warning');
          return false;
        }
        // Scaffalature: incoerenza netta classe Rosso con esito Conforme
        const cdEl = w.querySelector('#classe-danno');
        if (cdEl && cdEl.value === 'Rosso' && esito === 'Conforme') {
          U.toast('Incoerenza: classe di danno "Rosso" (fuori servizio) con esito "Conforme".', 'warning');
          return false;
        }
        return true;
      }
    });
    if (!res) return;
    const f = res.querySelector('#vform');
    v.data = f.data.value; v.verificatore = f.verificatore.value; v.esito = f.esito.value; v.note = f.note.value;
    v.tipoIspezione = f.tipoIspezione ? f.tipoIspezione.value : '';
    if (isScaff) v.classeDanno = f.classeDanno ? f.classeDanno.value : '';
    v.prossimaVerifica = f.prossimaVerifica.value || U.addMonthsISO(v.data, 12);
    v.checklist = {};
    cl.voci.forEach((voce, i) => {
      const sel = res.querySelector(`input[name="c${i}"]:checked`);
      v.checklist[voce] = sel ? sel.value : '';
    });
    const saved = await DB.put('verifiche', v);
    toast('Verifica salvata.', 'success');

    // proposta creazione NC se non conforme
    if (v.esito === 'Non conforme' || v.esito === 'Conforme con prescrizioni') {
      const genera = await confirmDialog('Esito con criticità: vuoi aprire una Non Conformità collegata a questa verifica?', 'Apri NC');
      if (genera) { NC.createFromVerifica(saved); return; }
    }
    render();
  }

  function radio3(name, voce, val) {
    // Pattern Bootstrap btn-check: input PRIMA della label con for/id (altrimenti
    // il selettore ".btn-check:checked + .btn" non aggiorna lo stato visivo).
    const opt = (v, lab, cls) => {
      const id = name + '-' + v;
      return `<input type="radio" class="btn-check" name="${name}" id="${id}" value="${v}" ${val === v ? 'checked' : ''} autocomplete="off">
        <label class="btn btn-sm btn-outline-${cls}" for="${id}">${lab}</label>`;
    };
    return `<div class="btn-group btn-group-sm" role="group">
      ${opt('si', 'Conf.', 'success')}${opt('no', 'N.C.', 'danger')}${opt('na', 'N.A.', 'secondary')}</div>`;
  }

  // ---------- Allegati e documentazione fotografica (condiviso) ----------
  async function renderAllegati(box, entita, refId) {
    const all = (await DB.all('allegati')).filter(a => a.entita === entita && a.refId === refId);
    box.innerHTML = `
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
        <h6 class="mb-0">📎 Foto e allegati <span class="text-muted small">(le foto vengono compresse e salvate localmente)</span></h6>
        <div class="d-flex align-items-center gap-2">
          <select class="form-select form-select-sm" id="al-tipo" style="width:170px">${options(DATA.TIPI_ALLEGATO)}</select>
          <button class="btn btn-sm btn-primary" id="al-cam-btn">📷 Scatta / Foto</button>
          <button class="btn btn-sm btn-outline-secondary" id="al-file-btn">📎 File/PDF</button>
        </div>
      </div>
      <input type="file" id="al-cam" accept="image/*" capture="environment" hidden>
      <input type="file" id="al-file" accept="application/pdf,image/jpeg,image/png,image/*" hidden>
      <div class="row g-2" id="alleg-list">
        ${all.length ? all.map(a => allegItem(a)).join('') : '<div class="col-12 text-muted small">Nessuna foto o allegato. Usa "Scatta / Foto".</div>'}
      </div>`;

    const tipoEl = box.querySelector('#al-tipo');
    const camEl = box.querySelector('#al-cam');
    const fileEl = box.querySelector('#al-file');
    box.querySelector('#al-cam-btn').onclick = () => { if (!tipoOrDefault(tipoEl)) tipoEl.value = 'Foto verifica'; camEl.click(); };
    box.querySelector('#al-file-btn').onclick = () => fileEl.click();

    const onPick = async (inputEl) => {
      const file = inputEl.files[0];
      inputEl.value = '';
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) { toast('File troppo grande (max 25 MB).', 'warning'); return; }
      try {
        let rec = { entita, refId, tipo: tipoEl.value, nome: file.name || 'foto.jpg', descrizione: '', creato: new Date().toISOString() };
        if (file.type && file.type.startsWith('image/')) {
          const c = await U.compressImage(file, 1600, 0.72);
          rec = Object.assign(rec, { mime: c.mime, size: c.size, data: c.dataURL, w: c.w, h: c.h });
          if (!/\.(jpe?g)$/i.test(rec.nome)) rec.nome = (rec.nome.replace(/\.[^.]+$/, '') || 'foto') + '.jpg';
        } else {
          rec = Object.assign(rec, { mime: file.type, size: file.size, data: await fileToDataURL(file), w: 0, h: 0 });
        }
        await DB.add('allegati', rec);
        toast('Foto/allegato salvato.', 'success');
        renderAllegati(box, entita, refId);
      } catch (e) { console.error(e); toast('Errore salvataggio: ' + e.message, 'danger'); }
    };
    camEl.onchange = () => onPick(camEl);
    fileEl.onchange = () => onPick(fileEl);

    // descrizione inline (salvataggio su blur)
    box.querySelectorAll('[data-desc]').forEach(t => t.onchange = async () => {
      const a = await DB.get('allegati', t.dataset.desc);
      if (a) { a.descrizione = t.value; await DB.put('allegati', a); toast('Descrizione salvata.', 'secondary'); }
    });
    box.querySelectorAll('[data-view]').forEach(b => b.onclick = async () => {
      const a = await DB.get('allegati', b.dataset.view);
      const w = window.open();
      if (w) w.document.write(a.mime && a.mime.includes('pdf')
        ? `<iframe src="${a.data}" style="border:0;width:100%;height:100%"></iframe>`
        : `<img src="${a.data}" style="max-width:100%">`);
    });
    box.querySelectorAll('[data-delal]').forEach(b => b.onclick = async () => {
      await DB.remove('allegati', b.dataset.delal);
      renderAllegati(box, entita, refId);
    });
  }
  global.renderAllegati = renderAllegati;

  function tipoOrDefault(el) { return el && el.value; }

  function allegItem(a) {
    const isImg = a.mime && a.mime.startsWith('image/');
    const thumb = isImg
      ? `<img src="${a.data}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:4px;cursor:pointer" data-view="${esc(a.id)}">`
      : `<div class="d-flex align-items-center justify-content-center bg-light border rounded" style="width:64px;height:64px;font-size:1.6rem;cursor:pointer" data-view="${esc(a.id)}">📄</div>`;
    return `<div class="col-md-6"><div class="border rounded p-2">
      <div class="d-flex gap-2">
        ${thumb}
        <div class="flex-grow-1" style="min-width:0">
          <div class="small text-truncate">${esc(a.nome)}</div>
          <div class="text-muted small">${esc(a.tipo || '')} · ${bytesHuman(a.size)}</div>
          <textarea class="form-control form-control-sm mt-1" rows="2" data-desc="${esc(a.id)}"
            placeholder="Descrizione / indicazione (comparirà nella relazione)">${esc(a.descrizione || '')}</textarea>
        </div>
        <div class="text-nowrap">
          <button class="btn btn-sm btn-outline-secondary" data-view="${esc(a.id)}">Vedi</button>
          <button class="btn btn-sm btn-outline-danger" data-delal="${esc(a.id)}">✕</button>
        </div>
      </div></div></div>`;
  }

  global.Verifiche = { render, newVerifica, openVerifica };
})(window);
