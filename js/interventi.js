// Interventi di messa in sicurezza scaffalature — iter Pubblica Amministrazione.
(function (global) {
  'use strict';
  const { esc, toast, modal, confirmDialog, options } = U;

  async function nextNumero() {
    const all = await DB.all('interventi');
    const anno = new Date().getFullYear();
    const n = all.filter(x => (x.numero || '').includes('-' + anno + '-')).length + 1;
    return 'INT-' + anno + '-' + String(n).padStart(3, '0');
  }

  function statoBadge(s) {
    const map = { 'Da avviare': 'bg-secondary', 'Determina in corso': 'bg-warning text-dark', 'Affidato': 'bg-info text-dark', 'In esecuzione': 'bg-primary', 'Collaudato/Chiuso': 'bg-success' };
    return `<span class="badge ${map[s] || 'bg-secondary'}">${esc(s || '—')}</span>`;
  }
  async function beneLabel(idBene) {
    const b = idBene ? await DB.get('beni', idBene) : null;
    if (!b) return '—';
    const p = await pathOfAmbiente(b.idAmbiente);
    return p.label + ' › ' + b.codice;
  }

  async function render() {
    const main = document.getElementById('main');
    let its = await DB.all('interventi');
    its.sort((a, b) => (b.numero || '').localeCompare(a.numero || ''));
    if (App.sedeAttiva) { const idx = await sedeIndex(); its = its.filter(i => idx.beneSede[i.idBene] === App.sedeAttiva); }

    const fStato = App.filters.intStato || '';
    if (fStato) its = its.filter(i => i.stato === fStato);

    let html = `<div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
      <h4 class="mb-0">Interventi (iter PA)</h4>
      <div class="d-flex gap-2">
        <select class="form-select form-select-sm" id="int-fs" style="width:180px">
          ${options([{ value: '', label: 'Tutti gli stati' }].concat(DATA.STATI_INTERVENTO.map(s => ({ value: s, label: s }))), fStato)}</select>
        <button class="btn btn-primary btn-sm" id="int-add">+ Nuovo intervento</button>
      </div></div>`;

    html += `<div class="table-responsive"><table class="table table-hover table-sm align-middle bg-white">
      <thead class="table-light"><tr>
        <th>N.</th><th>Bene</th><th>Tipo</th><th>Importo</th><th>Procedura</th><th>Atto</th><th>CIG</th><th>Stato</th><th class="text-center">Trasp.</th><th class="text-end">Azioni</th></tr></thead><tbody>`;
    if (!its.length) html += `<tr><td colspan="10" class="text-center text-muted py-4">Nessun intervento. Si avvia da una Non Conformità (Giallo/Rosso) o con "+ Nuovo intervento".</td></tr>`;
    for (const i of its) {
      html += `<tr>
        <td class="fw-semibold">${esc(i.numero)}</td>
        <td class="small">${esc(await beneLabel(i.idBene))}</td>
        <td class="small">${esc(i.tipo || '—')}</td>
        <td>${i.importoStimato ? '€ ' + Number(i.importoStimato).toLocaleString('it-IT') : '—'}</td>
        <td class="small">${esc(i.procedura || '—')}</td>
        <td class="small">${esc(i.attoAffidamento || i.attoContrarre || '—')}</td>
        <td class="small">${esc(i.cig || '—')}</td>
        <td>${statoBadge(i.stato)}</td>
        <td class="text-center">${i.pubblicatoTrasparenza ? '✅' : '—'}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-outline-secondary btn-sm" data-edit="${esc(i.id)}">Apri</button>
          <button class="btn btn-outline-danger btn-sm" data-del="${esc(i.id)}">Elimina</button>
        </td></tr>`;
    }
    html += '</tbody></table></div>';
    main.innerHTML = html;

    document.getElementById('int-add').onclick = () => edit(null);
    document.getElementById('int-fs').onchange = e => { App.filters.intStato = e.target.value; render(); };
    main.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => edit(b.dataset.edit));
    main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!await confirmDialog('Eliminare questo intervento?', 'Elimina')) return;
      await DB.remove('interventi', b.dataset.del);
      toast('Intervento eliminato.', 'danger'); render();
    });
  }

  // avvio dell'iter da una Non Conformità (Giallo/Rosso)
  async function createFromNc(nc) {
    const it = {
      numero: await nextNumero(), idNc: nc.id, idBene: nc.idBene || '',
      classeOrigine: (nc.descrizione && /Rosso/.test(nc.descrizione)) ? 'Rosso' : (/Giallo/.test(nc.descrizione || '') ? 'Giallo' : ''),
      tipo: 'Riparazione', importoStimato: '', categoriaAppalto: 'Fornitura e posa', procedura: '',
      attoContrarre: '', attoAffidamento: '', cig: '', cup: '', fornitore: '',
      dataAffidamento: '', dataEsecuzione: '', esitoCollaudo: '', pubblicatoTrasparenza: false, stato: 'Da avviare'
    };
    edit(null, it);
  }
  global.Interventi = { render, createFromNc };

  async function edit(id, preset) {
    let i = id ? await DB.get('interventi', id) : (preset || {
      numero: await nextNumero(), idNc: '', idBene: '', classeOrigine: '', tipo: 'Riparazione',
      importoStimato: '', categoriaAppalto: 'Fornitura e posa', procedura: '', attoContrarre: '', attoAffidamento: '',
      cig: '', cup: '', fornitore: '', dataAffidamento: '', dataEsecuzione: '', esitoCollaudo: '', pubblicatoTrasparenza: false, stato: 'Da avviare'
    });

    // elenco beni (scaffalature in primo piano), filtrati per sede attiva
    let beni = (await DB.all('beni'));
    if (App.sedeAttiva) { const idx = await sedeIndex(); beni = beni.filter(b => idx.beneSede[b.id] === App.sedeAttiva); }
    const beneOpts = [{ value: '', label: '—' }];
    for (const b of beni) { const p = await pathOfAmbiente(b.idAmbiente); beneOpts.push({ value: b.id, label: p.label + ' › ' + b.codice + ' (' + (b.categoria || '') + ')' }); }

    if (!i.procedura) i.procedura = DATA.proceduraDaImporto(i.categoriaAppalto, i.importoStimato);

    const body = `<form id="intform" class="row g-3">
      <div class="col-md-4"><label class="form-label">Numero</label><input class="form-control" name="numero" value="${esc(i.numero)}" readonly></div>
      <div class="col-md-4"><label class="form-label">Classe di origine</label><input class="form-control" name="classeOrigine" value="${esc(i.classeOrigine || '')}" readonly></div>
      <div class="col-md-4"><label class="form-label">Stato *</label><select class="form-select" name="stato" required>${options(DATA.STATI_INTERVENTO, i.stato)}</select></div>
      <div class="col-12"><label class="form-label">Bene interessato *</label><select class="form-select" name="idBene" required>${options(beneOpts, i.idBene)}</select></div>
      <div class="col-md-4"><label class="form-label">Tipo intervento *</label><select class="form-select" name="tipo" required>${options(DATA.TIPI_INTERVENTO, i.tipo)}</select></div>
      <div class="col-md-4"><label class="form-label">Categoria appalto</label><select class="form-select" name="categoriaAppalto" id="int-cat">${options(DATA.CATEGORIE_APPALTO, i.categoriaAppalto)}</select></div>
      <div class="col-md-4"><label class="form-label">Importo stimato (€)</label><input type="number" step="any" class="form-control" name="importoStimato" id="int-imp" value="${esc(i.importoStimato)}"></div>
      <div class="col-md-6"><label class="form-label">Procedura (D.Lgs. 36/2023)</label>
        <select class="form-select" name="procedura" id="int-proc">${options(DATA.PROCEDURE_APPALTO, i.procedura)}</select>
        <div class="form-text" id="int-proc-hint"></div></div>
      <div class="col-md-6"><label class="form-label">Fornitore / Operatore economico</label><input class="form-control" name="fornitore" value="${esc(i.fornitore || '')}"></div>
      <div class="col-md-6"><label class="form-label">Determina a contrarre</label><input class="form-control" name="attoContrarre" value="${esc(i.attoContrarre || '')}" placeholder="es. Det. n. __ del __"></div>
      <div class="col-md-6"><label class="form-label">Determina di affidamento</label><input class="form-control" name="attoAffidamento" value="${esc(i.attoAffidamento || '')}"></div>
      <div class="col-md-4"><label class="form-label">CIG</label><input class="form-control" name="cig" value="${esc(i.cig || '')}" placeholder="tracciabilità L.136/2010"></div>
      <div class="col-md-4"><label class="form-label">CUP</label><input class="form-control" name="cup" value="${esc(i.cup || '')}"></div>
      <div class="col-md-4"><label class="form-label">Data affidamento</label><input type="date" class="form-control" name="dataAffidamento" value="${esc(i.dataAffidamento || '')}"></div>
      <div class="col-md-4"><label class="form-label">Data esecuzione</label><input type="date" class="form-control" name="dataEsecuzione" value="${esc(i.dataEsecuzione || '')}"></div>
      <div class="col-md-4"><label class="form-label">Esito collaudo/verifica</label><input class="form-control" name="esitoCollaudo" value="${esc(i.esitoCollaudo || '')}"></div>
      <div class="col-md-4 d-flex align-items-end"><div class="form-check">
        <input class="form-check-input" type="checkbox" id="int-pub" ${i.pubblicatoTrasparenza ? 'checked' : ''}>
        <label class="form-check-label" for="int-pub">Pubblicato in Amm. Trasparente</label></div></div>
    </form>
    <div class="alert alert-light border small mt-2 mb-0">Alla chiusura (Collaudato): il bene torna "In uso"; se tipo = Dismissione, diventa "Dismesso".</div>`;

    const res = await modal({
      title: id ? 'Intervento ' + i.numero : 'Nuovo intervento (iter PA)', body, size: 'lg', okText: 'Salva intervento',
      onShow: (w) => {
        const ricalcola = () => {
          const cat = w.querySelector('#int-cat').value, imp = w.querySelector('#int-imp').value;
          const sug = DATA.proceduraDaImporto(cat, imp);
          w.querySelector('#int-proc').value = sug;
          const soglia = DATA.SOGLIE_APPALTO[cat] || 140000;
          w.querySelector('#int-proc-hint').textContent = 'Soglia affidamento diretto: € ' + soglia.toLocaleString('it-IT') + ' — proposta: ' + sug;
        };
        w.querySelector('#int-cat').onchange = ricalcola;
        w.querySelector('#int-imp').oninput = ricalcola;
        ricalcola();
      },
      onValidate: (w) => { const f = w.querySelector('#intform'); if (!f.checkValidity()) { f.reportValidity(); return false; } return true; }
    });
    if (!res) return;
    const f = res.querySelector('#intform');
    i.stato = f.stato.value; i.idBene = f.idBene.value; i.tipo = f.tipo.value;
    i.categoriaAppalto = f.categoriaAppalto.value; i.importoStimato = f.importoStimato.value === '' ? '' : Number(f.importoStimato.value);
    i.procedura = f.procedura.value; i.fornitore = f.fornitore.value;
    i.attoContrarre = f.attoContrarre.value; i.attoAffidamento = f.attoAffidamento.value;
    i.cig = f.cig.value; i.cup = f.cup.value; i.dataAffidamento = f.dataAffidamento.value;
    i.dataEsecuzione = f.dataEsecuzione.value; i.esitoCollaudo = f.esitoCollaudo.value;
    i.pubblicatoTrasparenza = res.querySelector('#int-pub').checked;
    await DB.put('interventi', i);

    // effetto sullo stato del bene alla chiusura
    if (i.stato === 'Collaudato/Chiuso' && i.idBene) {
      const bene = await DB.get('beni', i.idBene);
      if (bene) { bene.stato = /Dismissione/.test(i.tipo) ? 'Dismesso' : 'In uso'; await DB.put('beni', bene); }
    }
    toast('Intervento salvato.', 'success');
    render();
  }
})(window);
