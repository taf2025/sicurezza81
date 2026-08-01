// Modulo PRSES — Responsabile Scaffalature Metalliche (UNI EN 15635).
// Riusa anagrafica (beni), figure, verifiche, foto e report esistenti.
(function (global) {
  'use strict';
  const { esc, toast, modal, confirmDialog, options, fmtDate, todayISO } = U;

  // Beni che sono scaffalature (categoria) limitati alla sede attiva
  async function scaffalatureInScope() {
    const [beni, amb, piani, edi] = await Promise.all(
      [DB.all('beni'), DB.all('ambienti'), DB.all('piani'), DB.all('edifici')]);
    const mAmb = {}; amb.forEach((a) => mAmb[a.id] = a);
    const mPiano = {}; piani.forEach((p) => mPiano[p.id] = p);
    const mEdi = {}; edi.forEach((e) => mEdi[e.id] = e);
    const sedeDi = (b) => {
      const a = mAmb[b.idAmbiente]; if (!a) return null;
      const p = mPiano[a.idPiano]; if (!p) return null;
      const e = mEdi[p.idEdificio]; return e ? e.idSede : null;
    };
    let rows = beni.filter((b) => b.categoria === 'Scaffalatura metallica' || b.categoria === 'Rack informatico');
    if (App.sedeAttiva) rows = rows.filter((b) => sedeDi(b) === App.sedeAttiva);
    const ubic = {}; rows.forEach((b) => {
      const a = mAmb[b.idAmbiente];
      ubic[b.id] = a ? (a.codice + (a.tipologia ? ' (' + a.tipologia + ')' : '')) : '—';
    });
    return { rows, ubic };
  }

  async function render() {
    const main = document.getElementById('main');
    const { rows, ubic } = await scaffalatureInScope();
    const figure = (await DB.all('figure')).filter((f) => /PRSES|scaffalature/i.test(f.ruolo));
    const verifiche = (await DB.all('verifiche')).filter((v) => v.tipoChecklist === 'prses');
    const vByBene = {}; verifiche.forEach((v) => { (vByBene[v.idBene] = vByBene[v.idBene] || []).push(v); });

    // --- Nomine PRSES ---
    let nomine = `<div class="card mb-3"><div class="card-body">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="mb-0">👤 Nomine PRSES</h6>
        <button class="btn btn-outline-primary btn-sm" id="p-add-nomina">+ Nomina PRSES</button></div>`;
    if (!figure.length) nomine += '<p class="text-muted small mb-0">Nessun PRSES nominato. Registra il responsabile con atto di nomina e funzioni.</p>';
    else {
      nomine += '<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead class="table-light"><tr><th>Nominativo</th><th>Qualifica</th><th>Atto di nomina</th><th>Funzioni</th><th></th></tr></thead><tbody>';
      figure.forEach((f) => {
        nomine += `<tr><td class="fw-semibold">${esc(f.nominativo || '—')}</td><td class="small">${esc(f.qualifica || '—')}</td>
          <td class="small">${esc(f.attoNomina || '—')}${f.dataNomina ? '<br><span class="text-muted">' + fmtDate(f.dataNomina) + '</span>' : ''}</td>
          <td class="small">${esc(f.note || '—')}</td>
          <td class="text-end"><button class="btn btn-outline-secondary btn-sm" data-nomina="${esc(f.id)}">Modifica</button></td></tr>`;
      });
      nomine += '</tbody></table></div>';
    }
    nomine += '</div></div>';

    // --- Frequenze di ispezione ---
    let freq = `<div class="card mb-3"><div class="card-body"><h6>⏱️ Frequenze di ispezione (UNI EN 15635)</h6>
      <div class="table-responsive"><table class="table table-sm mb-0"><thead class="table-light"><tr><th>Livello</th><th>Frequenza</th><th>A cura di</th></tr></thead><tbody>`;
    DATA.FREQUENZE_ISPEZIONE.forEach((r) => { freq += `<tr><td>${esc(r.livello)}</td><td>${esc(r.frequenza)}</td><td>${esc(r.chi)}</td></tr>`; });
    freq += '</tbody></table></div></div></div>';

    // --- Elenco scaffalature ---
    let tab = `<div class="card"><div class="card-body">
      <h6 class="mb-2">🗄️ Scaffalature — ambito PRSES</h6>
      <div class="table-responsive"><table class="table table-hover table-sm align-middle mb-0">
      <thead class="table-light"><tr><th>Codice</th><th>Ubicazione</th><th>Sottotipo</th><th>Ambito</th><th>Anno</th><th>Cartello</th><th>Ultima isp.</th><th class="text-end">Azioni</th></tr></thead><tbody>`;
    if (!rows.length) tab += '<tr><td colspan="8" class="text-center text-muted py-4">Nessuna scaffalatura censita' + (App.sedeAttiva ? ' per la sede attiva' : '') + '. Aggiungile in <strong>Beni</strong>.</td></tr>';
    rows.forEach((b) => {
      const inScope = b.sottotipo ? DATA.ambitoPRSES(b.sottotipo) : true;
      const cartOk = b.cartello && DATA.CARTELLO_PORTATA.every((r) => b.cartello[r.chiave]);
      const ins = (vByBene[b.id] || []).sort((a, c) => (c.data || '').localeCompare(a.data || ''));
      const ultima = ins[0];
      tab += `<tr>
        <td class="fw-semibold">${esc(b.codice || '—')}</td>
        <td class="small">${esc(ubic[b.id] || '—')}</td>
        <td class="small">${esc(b.sottotipo || '<non definito>')}</td>
        <td>${inScope ? '<span class="badge bg-success">PRSES</span>' : '<span class="badge bg-secondary">Escluso</span>'}</td>
        <td class="small">${b.anno ? esc(String(b.anno)) + (Number(b.anno) < 2009 ? ' <span class="badge bg-warning text-dark">ante-2009</span>' : '') : '—'}</td>
        <td>${cartOk ? '<span class="badge bg-success">Completo</span>' : '<span class="badge bg-danger">Incompleto</span>'}</td>
        <td class="small">${ultima ? fmtDate(ultima.data) + ' ' + U.classeDannoBadge(ultima.classeDanno) : '—'}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-outline-secondary btn-sm" data-dati="${esc(b.id)}">Dati</button>
          <button class="btn btn-outline-secondary btn-sm" data-cart="${esc(b.id)}">Cartello</button>
          <button class="btn btn-primary btn-sm" data-isp="${esc(b.id)}">Ispezione</button>
          ${ultima ? '<button class="btn btn-outline-primary btn-sm" data-verb="' + esc(ultima.id) + '">Verbale</button>' : ''}
        </td></tr>`;
    });
    tab += '</tbody></table></div></div></div>';

    main.innerHTML = `<div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
      <div><h4 class="mb-0">PRSES — Scaffalature metalliche</h4>
        <small class="text-muted">Responsabile Sicurezza Attrezzature di Stoccaggio — UNI EN 15635 · D.Lgs. 81/2008</small></div>
    </div>${nomine}${freq}${tab}`;

    document.getElementById('p-add-nomina').onclick = () => editNomina(null);
    main.querySelectorAll('[data-nomina]').forEach((b) => b.onclick = () => editNomina(b.dataset.nomina));
    main.querySelectorAll('[data-dati]').forEach((b) => b.onclick = () => editDati(b.dataset.dati));
    main.querySelectorAll('[data-cart]').forEach((b) => b.onclick = () => editCartello(b.dataset.cart));
    main.querySelectorAll('[data-isp]').forEach((b) => b.onclick = () => nuovaIspezione(b.dataset.isp));
    main.querySelectorAll('[data-verb]').forEach((b) => b.onclick = () => selVerbale(b.dataset.verb));
  }

  // --- Nomina PRSES (riusa lo store 'figure') ---
  async function editNomina(id) {
    const sedi = await DB.all('sedi');
    let f = id ? await DB.get('figure', id)
      : { ruolo: 'PRSES - Resp. Sicurezza Attrezzature Stoccaggio', nominativo: '', qualifica: '', idSede: App.sedeAttiva || '', attoNomina: '', dataNomina: '', note: '' };
    const sedeOpts = [{ value: '', label: 'Tutte le sedi / Ente' }].concat(sedi.map((s) => ({ value: s.id, label: s.nome })));
    const body = `<form id="pnf" class="row g-3">
      <div class="col-md-6"><label class="form-label">Nominativo *</label><input class="form-control" name="nominativo" value="${esc(f.nominativo || '')}" required></div>
      <div class="col-md-6"><label class="form-label">Qualifica / Ufficio</label><input class="form-control" name="qualifica" value="${esc(f.qualifica || '')}" placeholder="es. Responsabile magazzino/archivi"></div>
      <div class="col-md-6"><label class="form-label">Sede di competenza</label><select class="form-select" name="idSede">${options(sedeOpts, f.idSede)}</select></div>
      <div class="col-md-3"><label class="form-label">Atto di nomina</label><input class="form-control" name="attoNomina" value="${esc(f.attoNomina || '')}" placeholder="es. Det. n. 12/2025"></div>
      <div class="col-md-3"><label class="form-label">Data nomina</label><input type="date" class="form-control" name="dataNomina" value="${esc(f.dataNomina || '')}"></div>
      <div class="col-12"><label class="form-label">Funzioni assegnate</label><textarea class="form-control" name="note" rows="3" placeholder="Ispezioni periodiche, tenuta registro controlli, verifica carichi, interdizione strutture danneggiate, coordinamento riparazioni…">${esc(f.note || '')}</textarea></div>
    </form>`;
    const res = await modal({ title: id ? 'Modifica nomina PRSES' : 'Nomina PRSES', body,
      onValidate: (w) => { const fm = w.querySelector('#pnf'); if (!fm.checkValidity()) { fm.reportValidity(); return false; } return true; } });
    if (!res) return;
    const fm = res.querySelector('#pnf');
    if (!id) f = { ruolo: 'PRSES - Resp. Sicurezza Attrezzature Stoccaggio' };
    f.nominativo = fm.nominativo.value; f.qualifica = fm.qualifica.value; f.idSede = fm.idSede.value;
    f.attoNomina = fm.attoNomina.value; f.dataNomina = fm.dataNomina.value; f.note = fm.note.value;
    await DB.put('figure', f); toast('Nomina PRSES salvata.', 'success'); render();
  }

  // --- Dati scaffalatura: sottotipo (ambito), anno, seminterrato, ante-2009 ---
  async function editDati(idBene) {
    const b = await DB.get('beni', idBene); if (!b) return;
    const a = b.ante2009 || {};
    const stOpts = [{ value: '', label: '— seleziona sottotipo —' }].concat(DATA.SOTTOTIPI_SCAFFALATURA.map((s) => ({ value: s.nome, label: s.nome + (s.ambito ? '' : ' (escluso PRSES)') })));
    const body = `<form id="pdf" class="row g-3">
      <div class="col-md-8"><label class="form-label">Sottotipo scaffalatura</label><select class="form-select" name="sottotipo">${options(stOpts, b.sottotipo || '')}</select>
        <div class="form-text" id="p-ambito"></div></div>
      <div class="col-md-4"><label class="form-label">Anno di installazione</label><input type="number" class="form-control" name="anno" value="${esc(b.anno || '')}" min="1950" max="2100"></div>
      <div class="col-12"><div class="form-check"><input class="form-check-input" type="checkbox" name="seminterrato" id="p-semi" ${b.seminterrato ? 'checked' : ''}><label class="form-check-label" for="p-semi">Locale interrato/umido (controlli rinforzati su ruggine)</label></div></div>
      <div class="col-12"><hr class="my-1"><strong class="small">Strutture ante-2009 (se anno &lt; 2009)</strong></div>
      <div class="col-12"><div class="form-check"><input class="form-check-input" type="checkbox" name="docPersa" id="p-doc" ${a.docPersa ? 'checked' : ''}><label class="form-check-label" for="p-doc">Documentazione/portata originale assente</label></div>
        <div class="form-check"><input class="form-check-input" type="checkbox" name="sismica" id="p-sis" ${a.sismica ? 'checked' : ''}><label class="form-check-label" for="p-sis">Conformità sismica non garantita</label></div>
        <div class="form-check"><input class="form-check-input" type="checkbox" name="modifiche" id="p-mod" ${a.modifiche ? 'checked' : ''}><label class="form-check-label" for="p-mod">Ripiani modificati/spostati nel tempo</label></div></div>
      <div class="col-12" id="p-ante"></div>
    </form>`;
    const aggiorna = (w) => {
      const st = w.querySelector('[name="sottotipo"]').value;
      w.querySelector('#p-ambito').innerHTML = st ? (DATA.ambitoPRSES(st) ? '<span class="text-success">Soggetta alle verifiche del PRSES (UNI EN 15635).</span>' : '<span class="text-secondary">Esclusa dall\'ambito PRSES: mobile da ufficio (UNI EN 14073/14074) — stabilità valutata nel DVR.</span>') : '';
      const anno = w.querySelector('[name="anno"]').value;
      const opt = { docPersa: w.querySelector('#p-doc').checked, sismica: w.querySelector('#p-sis').checked, modifiche: w.querySelector('#p-mod').checked };
      const az = DATA.valutazioneAnte2009(anno, opt);
      w.querySelector('#p-ante').innerHTML = az.length ? '<div class="alert alert-warning py-2 small mb-0"><strong>Azioni da mettere in campo:</strong><ul class="mb-0">' + az.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' : '';
    };
    const res = await modal({ title: 'Dati scaffalatura — ' + (b.codice || ''), body,
      onShow: (w) => { aggiorna(w); w.querySelectorAll('select,input').forEach((el) => el.addEventListener('change', () => aggiorna(w))); } });
    if (!res) return;
    const fm = res.querySelector('#pdf');
    b.sottotipo = fm.sottotipo.value;
    b.ambitoPRSES = b.sottotipo ? DATA.ambitoPRSES(b.sottotipo) : true;
    b.anno = fm.anno.value ? Number(fm.anno.value) : '';
    b.seminterrato = fm.seminterrato.checked;
    b.ante2009 = { docPersa: fm.docPersa.checked, sismica: fm.sismica.checked, modifiche: fm.modifiche.checked };
    await DB.put('beni', b); toast('Dati salvati.', 'success'); render();
  }

  // --- Scheda cartello di portata (6 requisiti) ---
  async function editCartello(idBene) {
    const b = await DB.get('beni', idBene); if (!b) return;
    const c = b.cartello || {};
    const body = `<form id="pcf" class="row g-3"><div class="col-12"><p class="small text-muted mb-1">Compila i 6 requisiti obbligatori del cartello di portata (UNI EN 15635). Lascia vuoto se assente.</p></div>` +
      DATA.CARTELLO_PORTATA.map((r) => `<div class="col-12"><label class="form-label small fw-semibold">${esc(r.label)}</label>
        <input class="form-control form-control-sm" name="${esc(r.chiave)}" value="${esc(c[r.chiave] || '')}"></div>`).join('') +
      `</form>`;
    const res = await modal({ title: 'Cartello di portata — ' + (b.codice || ''), body });
    if (!res) return;
    const fm = res.querySelector('#pcf');
    const nc = {}; DATA.CARTELLO_PORTATA.forEach((r) => { nc[r.chiave] = fm[r.chiave].value.trim(); });
    b.cartello = nc; await DB.put('beni', b);
    const mancanti = DATA.CARTELLO_PORTATA.filter((r) => !nc[r.chiave]).length;
    toast(mancanti ? ('Cartello salvato — ' + mancanti + ' requisiti mancanti.') : 'Cartello di portata completo.', mancanti ? 'warning' : 'success');
    render();
  }

  // --- Nuova ispezione PRSES (checklist 4 aree + azioni prescritte) ---
  async function nuovaIspezione(idBene) {
    const b = await DB.get('beni', idBene); if (!b) return;
    const prses = (await DB.all('figure')).filter((f) => /PRSES/i.test(f.ruolo));
    const verifOpts = [{ value: '', label: '— seleziona —' }].concat(prses.map((f) => ({ value: f.nominativo, label: f.nominativo })));
    const freqCons = DATA.frequenzaConsigliata(b.anno, b.seminterrato);
    let aree = DATA.CHECKLIST_PRSES.map((a) => `<h6 class="mt-2">${esc(a.area)}</h6>` + a.voci.map((v, j) => {
      const key = a.area.replace(/\W/g, '') + '_' + j;
      return `<div class="mb-2"><div class="small">${esc(v.t)}</div>
        <div class="btn-group btn-group-sm" role="group">
          <input type="radio" class="btn-check" name="${key}" id="${key}s" value="si" checked><label class="btn btn-outline-success" for="${key}s">Conforme</label>
          <input type="radio" class="btn-check" name="${key}" id="${key}n" value="no"><label class="btn btn-outline-danger" for="${key}n">Non conf.</label>
          <input type="radio" class="btn-check" name="${key}" id="${key}a" value="na"><label class="btn btn-outline-secondary" for="${key}a">N.A.</label>
        </div><div class="small text-danger mt-1 d-none" id="az_${key}"></div></div>`;
    }).join('')).join('');

    const body = `<form id="pif" class="row g-2">
      <div class="col-md-4"><label class="form-label">Data</label><input type="date" class="form-control form-control-sm" name="data" value="${todayISO()}"></div>
      <div class="col-md-4"><label class="form-label">Tipo ispezione</label><select class="form-select form-select-sm" name="tipoIspezione">${options(DATA.TIPI_ISPEZIONE)}</select></div>
      <div class="col-md-4"><label class="form-label">PRSES / Verificatore</label><select class="form-select form-select-sm" name="verificatore">${options(verifOpts)}</select></div>
      <div class="col-12"><div class="alert alert-light border py-1 small mb-1">Frequenza controllo visivo consigliata: <strong>${esc(freqCons)}</strong></div></div>
      <div class="col-md-6"><label class="form-label">Classe di danno (UNI EN 15635)</label><select class="form-select form-select-sm" name="classeDanno"><option value="">— automatica —</option>${options(Object.keys(DATA.CLASSI_DANNO))}</select></div>
      <div class="col-md-6"><label class="form-label">Esito</label><select class="form-select form-select-sm" name="esito">${options(DATA.ESITI)}</select></div>
      <div class="col-12">${aree}</div>
      <div class="col-12"><label class="form-label">Note</label><textarea class="form-control form-control-sm" name="note" rows="2"></textarea></div>
    </form>`;

    const res = await modal({ title: 'Ispezione PRSES — ' + (b.codice || ''), size: 'lg', body,
      onShow: (w) => {
        const upd = () => {
          let anyNo = false;
          DATA.CHECKLIST_PRSES.forEach((a, i) => a.voci.forEach((v, j) => {
            const key = a.area.replace(/\W/g, '') + '_' + j;
            const val = (w.querySelector('[name="' + key + '"]:checked') || {}).value;
            const az = w.querySelector('#az_' + key);
            if (val === 'no') { anyNo = true; az.classList.remove('d-none'); az.innerHTML = '<strong>Azioni prescritte:</strong> ' + v.az.map(esc).join(' · '); }
            else { az.classList.add('d-none'); az.innerHTML = ''; }
          }));
          const es = w.querySelector('[name="esito"]'); if (!es.dataset.touched) es.value = anyNo ? 'Non conforme' : 'Conforme';
        };
        w.querySelectorAll('input[type="radio"]').forEach((r) => r.addEventListener('change', upd));
        w.querySelector('[name="esito"]').addEventListener('change', (e) => e.target.dataset.touched = '1');
        upd();
      } });
    if (!res) return;
    const fm = res.querySelector('#pif');
    const areeData = DATA.CHECKLIST_PRSES.map((a) => ({
      area: a.area,
      voci: a.voci.map((v, j) => {
        const key = a.area.replace(/\W/g, '') + '_' + j;
        const esito = (fm.querySelector('[name="' + key + '"]:checked') || {}).value || 'na';
        return { t: v.t, esito, az: esito === 'no' ? v.az.slice() : [] };
      })
    }));
    let classe = fm.classeDanno.value;
    if (!classe) { const anyNo = areeData.some((a) => a.voci.some((v) => v.esito === 'no')); classe = anyNo ? 'Giallo' : 'Verde'; }
    const giorni = (DATA.CLASSI_DANNO[classe] || {}).giorni || 365;
    const prossima = new Date(fm.data.value || todayISO()); prossima.setDate(prossima.getDate() + giorni);
    const rec = {
      tipoChecklist: 'prses', idBene: b.id, idAmbiente: b.idAmbiente,
      data: fm.data.value, tipoIspezione: fm.tipoIspezione.value, verificatore: fm.verificatore.value,
      classeDanno: classe, esito: fm.esito.value, prossimaVerifica: prossima.toISOString().slice(0, 10),
      aree: areeData, ante2009: DATA.valutazioneAnte2009(b.anno, b.ante2009 || {}), note: fm.note.value
    };
    const saved = await DB.put('verifiche', rec);
    toast('Ispezione PRSES salvata.', 'success');
    if (await confirmDialog('Generare subito il verbale PDF di ispezione PRSES?', 'Genera PDF')) {
      try { await Reports.verbalePRSESPdf(saved); } catch (e) { toast('Errore verbale: ' + e.message, 'danger'); }
    }
    render();
  }

  // --- Scelta formato verbale ---
  async function selVerbale(idVerifica) {
    const v = await DB.get('verifiche', idVerifica); if (!v) return;
    const res = await modal({ title: 'Verbale ispezione PRSES', size: 'sm', okText: 'Genera',
      body: '<label class="form-label small">Formato del verbale</label><select class="form-select" id="pvf"><option value="pdf">PDF</option><option value="docx">Word (.docx)</option></select>' });
    if (!res) return;
    const fmt = res.querySelector('#pvf').value;
    try {
      if (fmt === 'docx') await Reports.verbalePRSESDocx(v); else await Reports.verbalePRSESPdf(v);
      toast('Verbale generato.', 'success');
    } catch (e) { toast('Errore: ' + e.message, 'danger'); }
  }

  global.PRSES = { render };
})(window);
