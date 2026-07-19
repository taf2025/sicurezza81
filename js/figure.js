/* ============================================================
   figure.js — Organigramma della sicurezza (figure D.Lgs. 81/2008)
   ============================================================ */
(function (global) {
  'use strict';
  const { esc, toast, modal, confirmDialog, options } = U;

  async function render() {
    const main = document.getElementById('main');
    const [figure, sedi] = await Promise.all([DB.all('figure'), DB.all('sedi')]);
    const sMap = {}; sedi.forEach(s => sMap[s.id] = s);

    const fRuolo = App.filters.figRuolo || '';
    const fSede = App.filters.figSede || '';
    let rows = figure.slice();
    if (fRuolo) rows = rows.filter(f => f.ruolo === fRuolo);
    if (fSede) rows = rows.filter(f => (f.idSede || '') === fSede);

    // ordina per ruolo (secondo l'ordine ufficiale) poi per sede
    const ord = {}; DATA.RUOLI_FIGURE.forEach((r, i) => ord[r] = i);
    rows.sort((a, b) => (ord[a.ruolo] - ord[b.ruolo]) || (a.nominativo || '').localeCompare(b.nominativo || ''));

    let html = `<div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
      <div><h4 class="mb-0">Organigramma della sicurezza</h4>
        <small class="text-muted">Figure della prevenzione e protezione — D.Lgs. 81/2008</small></div>
      <div class="d-flex gap-2 flex-wrap">
        <select class="form-select form-select-sm" id="fig-fr" style="width:200px">
          ${options([{ value: '', label: 'Tutti i ruoli' }].concat(DATA.RUOLI_FIGURE.map(r => ({ value: r, label: r }))), fRuolo)}</select>
        <select class="form-select form-select-sm" id="fig-fs" style="width:180px">
          ${options([{ value: '', label: 'Tutte le sedi' }].concat(sedi.map(s => ({ value: s.id, label: s.nome }))), fSede)}</select>
        <button class="btn btn-primary btn-sm" id="fig-add">+ Nuova figura</button>
      </div></div>`;

    html += `<div class="table-responsive"><table class="table table-hover table-sm align-middle bg-white">
      <thead class="table-light"><tr>
        <th>Ruolo</th><th>Nominativo</th><th>Qualifica / Ufficio</th><th>Sede</th>
        <th>Contatti</th><th>Nomina</th><th>Rif. normativo</th><th class="text-end">Azioni</th></tr></thead><tbody>`;
    if (!rows.length) html += `<tr><td colspan="8" class="text-center text-muted py-4">Nessuna figura registrata. Usa "+ Nuova figura".</td></tr>`;
    rows.forEach(f => {
      const sede = f.idSede ? (sMap[f.idSede] ? sMap[f.idSede].nome : '—') : 'Tutte le sedi / Ente';
      const contatti = [f.email, f.telefono].filter(Boolean).join(' · ') || '—';
      html += `<tr>
        <td><span class="badge bg-dark">${esc(f.ruolo)}</span></td>
        <td class="fw-semibold">${esc(f.nominativo || '—')}</td>
        <td class="small">${esc(f.qualifica || '—')}</td>
        <td class="small">${esc(sede)}</td>
        <td class="small">${esc(contatti)}</td>
        <td class="small">${U.fmtDate(f.dataNomina)}</td>
        <td class="small text-muted">${esc(DATA.RUOLO_NORMA[f.ruolo] || '')}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-outline-secondary btn-sm" data-edit="${esc(f.id)}">Modifica</button>
          <button class="btn btn-outline-danger btn-sm" data-del="${esc(f.id)}">Elimina</button>
        </td></tr>`;
    });
    html += '</tbody></table></div>';
    main.innerHTML = html;

    document.getElementById('fig-add').onclick = () => edit(null);
    document.getElementById('fig-fr').onchange = e => { App.filters.figRuolo = e.target.value; render(); };
    document.getElementById('fig-fs').onchange = e => { App.filters.figSede = e.target.value; render(); };
    main.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => edit(b.dataset.edit));
    main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!await confirmDialog('Eliminare questa figura dall\'organigramma?', 'Elimina')) return;
      await DB.remove('figure', b.dataset.del);
      toast('Figura eliminata.', 'danger'); render();
    });
  }

  async function edit(id) {
    const sedi = await DB.all('sedi');
    let f = id ? await DB.get('figure', id) : { ruolo: 'Datore di Lavoro', nominativo: '', qualifica: '', idSede: '', email: '', telefono: '', dataNomina: '', note: '' };
    const sedeOpts = [{ value: '', label: 'Tutte le sedi / Ente' }].concat(sedi.map(s => ({ value: s.id, label: s.nome })));

    const body = `<form id="figform" class="row g-3">
      <div class="col-md-6"><label class="form-label">Ruolo *</label>
        <select class="form-select" name="ruolo" required>${options(DATA.RUOLI_FIGURE, f.ruolo)}</select>
        <div class="form-text" id="ruolo-norma">${esc(DATA.RUOLO_NORMA[f.ruolo] || '')}</div></div>
      <div class="col-md-6"><label class="form-label">Nominativo *</label>
        <input class="form-control" name="nominativo" value="${esc(f.nominativo || '')}" required></div>
      <div class="col-md-6"><label class="form-label">Qualifica / Ufficio</label>
        <input class="form-control" name="qualifica" value="${esc(f.qualifica || '')}" placeholder="es. Dirigente Area Tecnica"></div>
      <div class="col-md-6"><label class="form-label">Sede di competenza</label>
        <select class="form-select" name="idSede">${options(sedeOpts, f.idSede)}</select></div>
      <div class="col-md-4"><label class="form-label">Email</label>
        <input type="email" class="form-control" name="email" value="${esc(f.email || '')}"></div>
      <div class="col-md-4"><label class="form-label">Telefono</label>
        <input class="form-control" name="telefono" value="${esc(f.telefono || '')}"></div>
      <div class="col-md-4"><label class="form-label">Data nomina/incarico</label>
        <input type="date" class="form-control" name="dataNomina" value="${esc(f.dataNomina || '')}"></div>
      <div class="col-12"><label class="form-label">Note</label>
        <textarea class="form-control" name="note" rows="2">${esc(f.note || '')}</textarea></div>
    </form>`;

    const res = await modal({
      title: id ? 'Modifica figura' : 'Nuova figura',
      body,
      onShow: (w) => {
        const sel = w.querySelector('select[name="ruolo"]');
        sel.onchange = () => { w.querySelector('#ruolo-norma').textContent = DATA.RUOLO_NORMA[sel.value] || ''; };
      },
      onValidate: (w) => { const fm = w.querySelector('#figform'); if (!fm.checkValidity()) { fm.reportValidity(); return false; } return true; }
    });
    if (!res) return;
    const fm = res.querySelector('#figform');
    if (!id) f = {};
    f.ruolo = fm.ruolo.value; f.nominativo = fm.nominativo.value; f.qualifica = fm.qualifica.value;
    f.idSede = fm.idSede.value; f.email = fm.email.value; f.telefono = fm.telefono.value;
    f.dataNomina = fm.dataNomina.value; f.note = fm.note.value;
    await DB.put('figure', f);
    toast('Figura salvata.', 'success');
    render();
  }

  global.Figure = { render };
})(window);
