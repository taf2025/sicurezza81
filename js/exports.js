/* ============================================================
   exports.js — Esportazione Excel + Backup/Ripristino JSON
   ============================================================ */
(function (global) {
  'use strict';
  const { toast, downloadBlob, confirmDialog } = U;

  async function backup() {
    const dump = await DB.exportAll();
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const op = DB.getOperatore().codice || 'NA';
    downloadBlob(blob, 'backup_sicurezza81_' + op + '_' + stamp + '.json');
    toast('Backup scaricato.', 'success');
  }

  async function restore(fileEl, mode) {
    const files = Array.from(fileEl.files || []);
    if (!files.length) { toast('Seleziona uno o più file di backup.', 'warning'); return; }
    if (mode === 'replace') {
      if (files.length > 1) { toast('La sostituzione accetta un solo file. Per più file usa "Unisci".', 'warning'); return; }
      if (!await confirmDialog('Il ripristino con SOSTITUZIONE cancellerà tutti i dati attuali. Continuare?', 'Sostituisci')) return;
    }
    try {
      const tot = { added: 0, updated: 0, skipped: 0, conflicts: [], files: [] };
      for (const file of files) {
        const dump = JSON.parse(await file.text());
        const st = await DB.importAll(dump, mode);
        tot.added += st.added; tot.updated += st.updated; tot.skipped += st.skipped;
        tot.conflicts = tot.conflicts.concat(st.conflicts || []);
        tot.files.push({ nome: file.name, op: (dump._operatore && dump._operatore.codice) || '?' });
      }
      showReport(mode, tot);
      go('dashboard');
    } catch (e) {
      console.error(e); toast('Errore ripristino: ' + e.message, 'danger');
    }
  }

  function showReport(mode, t) {
    const rows = t.files.map(f => `<li class="small">${U.esc(f.nome)} <span class="badge bg-secondary">op. ${U.esc(f.op)}</span></li>`).join('');
    const confl = t.conflicts.length
      ? `<div class="alert alert-warning py-2 mt-2 mb-0"><strong>${t.conflicts.length} conflitti</strong> (record modificati da più operatori): mantenuta la versione più recente.
         <ul class="mb-0 small">${t.conflicts.slice(0, 12).map(c => `<li>${U.esc(c.store)} · ${U.esc(String(c.id))}: tenuto <strong>${U.esc(c.teniamo)}</strong>, scartato ${U.esc(c.scartiamo)}</li>`).join('')}</ul></div>`
      : '<div class="text-success small mt-2">Nessun conflitto.</div>';
    U.modal({
      title: mode === 'merge' ? 'Riconciliazione completata' : 'Ripristino completato',
      size: 'md', okText: 'OK', hideCancel: true,
      body: `<div class="row text-center g-2 mb-2">
          <div class="col"><div class="fs-4 fw-bold text-success">${t.added}</div><div class="small text-muted">aggiunti</div></div>
          <div class="col"><div class="fs-4 fw-bold text-primary">${t.updated}</div><div class="small text-muted">aggiornati</div></div>
          <div class="col"><div class="fs-4 fw-bold text-secondary">${t.skipped}</div><div class="small text-muted">invariati</div></div>
        </div>
        <div><strong>File elaborati:</strong><ul class="mb-0">${rows}</ul></div>${confl}`
    });
    toast('Operazione completata.', 'success');
  }

  async function excel() {
    try {
      const wb = XLSX.utils.book_new();
      const [sedi, edifici, piani, ambienti, beni, verifiche, nc, figure] = await Promise.all([
        DB.all('sedi'), DB.all('edifici'), DB.all('piani'), DB.all('ambienti'),
        DB.all('beni'), DB.all('verifiche'), DB.all('nonconformita'), DB.all('figure')
      ]);
      const sMap = idx(sedi), eMap = idx(edifici), pMap = idx(piani), aMap = idx(ambienti), bMap = idx(beni), vMap = idx(verifiche);

      add(wb, 'Sedi', sedi.map(s => ({ Codice: s.codice, Nome: s.nome, Indirizzo: s.indirizzo, Responsabile: s.responsabile, Note: s.note })));
      add(wb, 'Edifici', edifici.map(e => ({ Sede: nom(sMap[e.idSede], 'nome'), Edificio: e.nome, Descrizione: e.descrizione })));
      add(wb, 'Piani', piani.map(p => ({ Edificio: nom(eMap[p.idEdificio], 'nome'), Piano: p.numero, Descrizione: p.descrizione })));
      add(wb, 'Ambienti', ambienti.map(a => ({
        Piano: nom(pMap[a.idPiano], 'numero'), Codice: a.codice, Tipologia: a.tipologia,
        Responsabile: a.responsabile, Superficie: a.superficie, Note: a.note
      })));
      add(wb, 'Beni', beni.map(b => ({
        Ambiente: nom(aMap[b.idAmbiente], 'codice'), Codice: b.codice, Categoria: b.categoria, Descrizione: b.descrizione,
        Marca: b.marca, Modello: b.modello, Anno: b.anno, Altezza: b.altezza, Portata: b.portata, Ancorato: b.ancorato, Stato: b.stato
      })));
      add(wb, 'Verifiche', verifiche.map(v => ({
        Data: v.data, Bene: nom(bMap[v.idBene], 'codice'), Ambiente: nom(aMap[v.idAmbiente], 'codice'),
        Checklist: v.tipoChecklist, TipoIspezione: v.tipoIspezione, Verificatore: v.verificatore,
        Esito: v.esito, ClasseDanno: v.classeDanno, ProssimaVerifica: v.prossimaVerifica, Note: v.note
      })));
      add(wb, 'Figure', figure.map(f => ({
        Ruolo: f.ruolo, Nominativo: f.nominativo, Qualifica: f.qualifica,
        Sede: f.idSede ? nom(sMap[f.idSede], 'nome') : 'Tutte le sedi / Ente',
        Email: f.email, Telefono: f.telefono, Nomina: f.dataNomina, Note: f.note
      })));
      add(wb, 'NonConformita', nc.map(n => ({
        Numero: n.numero, Apertura: n.dataApertura, Bene: nom(bMap[n.idBene], 'codice'), Ambiente: nom(aMap[n.idAmbiente], 'codice'),
        Descrizione: n.descrizione, Rischio: n.livelloRischio, Misure: (n.misure || []).join('; '),
        Responsabile: n.responsabile, Scadenza: n.dataPrevista, Chiusura: n.dataChiusura, Stato: n.stato
      })));

      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, 'sicurezza81_export_' + stamp + '.xlsx');
      toast('Excel esportato.', 'success');
    } catch (e) { console.error(e); toast('Errore export Excel: ' + e.message, 'danger'); }
  }

  function idx(arr) { const m = {}; arr.forEach(r => m[r.id] = r); return m; }
  function nom(o, f) { return o ? o[f] : ''; }
  function add(wb, name, rows) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  global.Exports = { backup, restore, excel };
})(window);
