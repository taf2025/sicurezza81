/* ============================================================
   nc.js — Modulo Gestione Non Conformità
   ============================================================ */
(function (global) {
  'use strict';
  const { esc, toast, modal, confirmDialog, statoNcBadge, rischioBadge, fmtDate, options } = U;

  async function nextNumero() {
    const all = await DB.all('nonconformita');
    const year = new Date().getFullYear();
    const n = all.filter(x => (x.numero || '').includes('-' + year + '-')).length + 1;
    return `NC-${year}-${String(n).padStart(3, '0')}`;
  }

  async function render() {
    const main = document.getElementById('main');
    let ncs = await DB.all('nonconformita');
    ncs.sort((a, b) => (b.dataApertura || '').localeCompare(a.dataApertura || ''));

    const fStato = App.filters.ncStato || '';
    const fRischio = App.filters.ncRischio || '';
    if (fStato) ncs = ncs.filter(n => n.stato === fStato);
    if (fRischio) ncs = ncs.filter(n => n.livelloRischio === fRischio);

    let html = `<div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
      <h4 class="mb-0">Non Conformità</h4>
      <div class="d-flex gap-2">
        <select class="form-select form-select-sm" id="nc-fs" style="width:150px">
          ${options([{ value: '', label: 'Tutti gli stati' }].concat(DATA.STATI_NC.map(s => ({ value: s, label: s }))), fStato)}</select>
        <select class="form-select form-select-sm" id="nc-fr" style="width:150px">
          ${options([{ value: '', label: 'Tutti i rischi' }].concat(DATA.LIVELLI_RISCHIO.map(s => ({ value: s, label: 'Rischio ' + s }))), fRischio)}</select>
        <button class="btn btn-primary btn-sm" id="nc-add">+ Nuova NC</button>
      </div></div>`;

    html += `<div class="table-responsive"><table class="table table-hover table-sm align-middle bg-white">
      <thead class="table-light"><tr>
        <th>N. NC</th><th>Apertura</th><th>Ubicazione / Bene</th><th>Descrizione</th>
        <th>Rischio</th><th>Scadenza</th><th>Stato</th><th class="text-end">Azioni</th></tr></thead><tbody>`;
    if (!ncs.length) html += `<tr><td colspan="8" class="text-center text-muted py-4">Nessuna non conformità.</td></tr>`;
    for (const n of ncs) {
      const loc = await locLabel(n);
      const scaduta = n.stato !== 'Chiusa' && n.dataPrevista && n.dataPrevista < U.todayISO();
      html += `<tr class="${scaduta ? 'table-danger' : ''}">
        <td class="fw-semibold">${esc(n.numero)}</td>
        <td>${fmtDate(n.dataApertura)}</td>
        <td class="small">${esc(loc)}</td>
        <td class="small">${esc((n.descrizione || '').slice(0, 60))}${(n.descrizione || '').length > 60 ? '…' : ''}</td>
        <td>${rischioBadge(n.livelloRischio)}</td>
        <td>${fmtDate(n.dataPrevista)} ${scaduta ? '<span class="badge bg-danger">scaduta</span>' : ''}</td>
        <td>${statoNcBadge(n.stato)}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-outline-secondary btn-sm" data-edit="${esc(n.id)}">Apri</button>
          <button class="btn btn-outline-danger btn-sm" data-del="${esc(n.id)}">Elimina</button>
        </td></tr>`;
    }
    html += '</tbody></table></div>';
    main.innerHTML = html;

    document.getElementById('nc-add').onclick = () => edit(null);
    document.getElementById('nc-fs').onchange = e => { App.filters.ncStato = e.target.value; render(); };
    document.getElementById('nc-fr').onchange = e => { App.filters.ncRischio = e.target.value; render(); };
    main.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => edit(b.dataset.edit));
    main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!await confirmDialog('Eliminare la non conformità?', 'Elimina')) return;
      await DB.removeCascade('nonconformita', b.dataset.del);
      toast('NC eliminata.', 'danger'); render();
    });
  }

  async function locLabel(n) {
    if (n.idBene) {
      const b = await DB.get('beni', n.idBene);
      if (b) { const p = await pathOfAmbiente(b.idAmbiente); return p.label + ' › ' + b.codice; }
    }
    if (n.idAmbiente) { const p = await pathOfAmbiente(n.idAmbiente); return p.label; }
    return '—';
  }

  async function createFromVerifica(v) {
    const numero = await nextNumero();
    const nc = {
      numero, dataApertura: U.todayISO(), idVerifica: v.id, idBene: v.idBene || '', idAmbiente: v.idAmbiente || '',
      descrizione: '', livelloRischio: 'Medio', misure: [], responsabile: '', dataPrevista: '', dataChiusura: '', stato: 'Aperta'
    };
    // precompila descrizione con voci non conformi
    if (v.checklist) {
      const nonConf = Object.keys(v.checklist).filter(k => v.checklist[k] === 'no');
      if (nonConf.length) nc.descrizione = 'Requisiti non conformi: ' + nonConf.join('; ') + '.';
    }
    // mappatura dalla classificazione danni UNI EN 15635 (semaforo)
    const cd = v.classeDanno && DATA.CLASSI_DANNO[v.classeDanno];
    if (cd) {
      nc.livelloRischio = cd.rischio;
      nc.dataPrevista = new Date(Date.now() + cd.giorni * 86400000).toISOString().slice(0, 10);
      nc.descrizione = (nc.descrizione ? nc.descrizione + ' ' : '') + 'Classificazione UNI EN 15635: ' + v.classeDanno + ' — ' + cd.azione;
      if (v.classeDanno === 'Rosso') nc.misure = ['Interdizione area', 'Sospensione utilizzo'];
      else if (v.classeDanno === 'Giallo') nc.misure = ['Delimitazione area', 'Richiesta manutenzione'];
    }
    edit(null, nc);
  }
  global.NC = { render, createFromVerifica };

  async function edit(id, preset) {
    let n = id ? await DB.get('nonconformita', id) : (preset || {
      numero: await nextNumero(), dataApertura: U.todayISO(), idVerifica: '', idBene: '', idAmbiente: '',
      descrizione: '', livelloRischio: 'Medio', misure: [], responsabile: '', dataPrevista: '', dataChiusura: '', stato: 'Aperta'
    });

    // selettori ambiente/bene
    const ambienti = await DB.all('ambienti');
    const beni = await DB.all('beni');
    const ambOpts = [{ value: '', label: '—' }];
    for (const a of ambienti) { const p = await pathOfAmbiente(a.id); ambOpts.push({ value: a.id, label: p.label }); }
    const beneOpts = [{ value: '', label: '—' }].concat(beni.map(b => ({ value: b.id, label: b.codice + ' · ' + (b.categoria || '') })));

    const misureHtml = DATA.MISURE_IMMEDIATE.map((m, i) =>
      `<div class="col-md-6 form-check ms-2">
        <input class="form-check-input" type="checkbox" id="mis${i}" value="${esc(m)}" ${(n.misure || []).includes(m) ? 'checked' : ''}>
        <label class="form-check-label small" for="mis${i}">${esc(m)}</label></div>`).join('');

    const body = `<form id="ncform" class="row g-3">
      <div class="col-md-4"><label class="form-label">Numero NC</label>
        <input class="form-control" name="numero" value="${esc(n.numero)}" readonly></div>
      <div class="col-md-4"><label class="form-label">Data apertura *</label>
        <input type="date" class="form-control" name="dataApertura" value="${esc(n.dataApertura)}" required></div>
      <div class="col-md-4"><label class="form-label">Livello rischio *</label>
        <select class="form-select" name="livelloRischio" required>${options(DATA.LIVELLI_RISCHIO, n.livelloRischio)}</select></div>
      <div class="col-md-6"><label class="form-label">Ambiente</label>
        <select class="form-select" name="idAmbiente">${options(ambOpts, n.idAmbiente)}</select></div>
      <div class="col-md-6"><label class="form-label">Bene interessato</label>
        <select class="form-select" name="idBene">${options(beneOpts, n.idBene)}</select></div>
      <div class="col-12"><label class="form-label">Descrizione *</label>
        <textarea class="form-control" name="descrizione" rows="2" required>${esc(n.descrizione)}</textarea></div>
      <div class="col-12"><label class="form-label">Misure immediate</label>
        <div class="row g-1">${misureHtml}</div></div>
      <div class="col-md-4"><label class="form-label">Responsabile azione</label>
        <input class="form-control" name="responsabile" value="${esc(n.responsabile || '')}"></div>
      <div class="col-md-4"><label class="form-label">Data prevista chiusura</label>
        <input type="date" class="form-control" name="dataPrevista" value="${esc(n.dataPrevista || '')}"></div>
      <div class="col-md-4"><label class="form-label">Stato *</label>
        <select class="form-select" name="stato" required>${options(DATA.STATI_NC, n.stato)}</select></div>
      <div class="col-md-4"><label class="form-label">Data chiusura effettiva</label>
        <input type="date" class="form-control" name="dataChiusura" value="${esc(n.dataChiusura || '')}"></div>
    </form>
    ${id ? '<hr><div id="nc-alleg"></div>' : ''}`;

    const res = await modal({
      title: id ? 'Non Conformità ' + n.numero : 'Nuova Non Conformità',
      body, size: 'lg', okText: 'Salva NC',
      onShow: (w) => { if (id) renderAllegati(w.querySelector('#nc-alleg'), 'nonconformita', id); },
      onValidate: (w) => { const f = w.querySelector('#ncform'); if (!f.checkValidity()) { f.reportValidity(); return false; } return true; }
    });
    if (!res) return;
    const f = res.querySelector('#ncform');
    n.dataApertura = f.dataApertura.value; n.livelloRischio = f.livelloRischio.value;
    n.idAmbiente = f.idAmbiente.value; n.idBene = f.idBene.value;
    n.descrizione = f.descrizione.value; n.responsabile = f.responsabile.value;
    n.dataPrevista = f.dataPrevista.value; n.stato = f.stato.value; n.dataChiusura = f.dataChiusura.value;
    n.misure = DATA.MISURE_IMMEDIATE.filter((m, i) => res.querySelector('#mis' + i).checked);
    if (n.stato === 'Chiusa' && !n.dataChiusura) n.dataChiusura = U.todayISO();
    await DB.put('nonconformita', n);
    toast('Non conformità salvata.', 'success');
    render();
  }
})(window);
