/* ============================================================
   reports.js — Generazione PDF (jsPDF + autotable)
   ============================================================ */
(function (global) {
  'use strict';
  const { esc, toast, modal, fmtDate, options } = U;

  function doc() {
    const { jsPDF } = window.jspdf;
    return new jsPDF({ unit: 'mm', format: 'a4' });
  }

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
  }

  function header(d, titolo, sottotitolo) {
    d.setFillColor(13, 71, 45); // verde PA
    d.rect(0, 0, 210, 22, 'F');
    d.setTextColor(255); d.setFont('helvetica', 'bold'); d.setFontSize(13);
    d.text('Sicurezza Ambienti di Lavoro', 14, 10);
    d.setFontSize(8); d.setFont('helvetica', 'normal');
    d.text('D.Lgs. 81/2008 — artt. 15,17,18,28,29,63,64 e Allegato IV', 14, 16);
    d.setTextColor(0);
    d.setFont('helvetica', 'bold'); d.setFontSize(14);
    d.text(titolo, 14, 32);
    if (sottotitolo) { d.setFont('helvetica', 'normal'); d.setFontSize(10); d.text(sottotitolo, 14, 38); }
    return sottotitolo ? 44 : 40;
  }

  function footer(d) {
    const pages = d.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      d.setPage(i); d.setFontSize(8); d.setTextColor(120);
      d.text('Generato il ' + new Date().toLocaleString('it-IT'), 14, 290);
      d.text('Pag. ' + i + '/' + pages, 196, 290, { align: 'right' });
    }
  }

  function firma(d, y) {
    d.setTextColor(0); d.setFontSize(10);
    d.text('Il Verificatore', 140, y + 16);
    d.line(140, y + 26, 196, y + 26);
    return y + 30;
  }

  async function verbaleVerifica(v) {
    const ctx = await contextOfVerifica(v);
    const cl = DATA.CHECKLIST[v.tipoChecklist];
    const isScaff = v.tipoChecklist === 'scaffalature';
    const d = doc();
    let y = header(d, isScaff ? 'Verbale di verifica scaffalature' : (v.idBene ? 'Verbale di verifica bene/arredo' : 'Verbale di verifica ambiente'),
      'Riferimento: ' + cl.norma);

    const infoBody = [
      ['Ubicazione', ctx.label],
      ['Oggetto', ctx.bene ? (ctx.bene.codice + ' — ' + (ctx.bene.categoria || '')) : (ctx.ambiente ? ctx.ambiente.codice + ' (' + (ctx.ambiente.tipologia || '') + ')' : '—')],
      ['Data verifica', fmtDate(v.data)],
      ['Tipo di ispezione', v.tipoIspezione || '—'],
      ['Verificatore', v.verificatore || '—'],
      ['Esito', v.esito || '—']
    ];
    if (isScaff) infoBody.push(['Classe di danno (UNI EN 15635)', v.classeDanno ? (v.classeDanno + (DATA.CLASSI_DANNO[v.classeDanno] ? ' — ' + DATA.CLASSI_DANNO[v.classeDanno].azione : '')) : '—']);
    infoBody.push(['Prossima verifica prevista', fmtDate(v.prossimaVerifica)]);
    d.autoTable({
      startY: y, theme: 'grid', styles: { fontSize: 9 },
      head: [['Dato', 'Valore']], body: infoBody,
      headStyles: { fillColor: [13, 71, 45] }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
      didParseCell: (data) => {
        if (isScaff && data.section === 'body' && data.column.index === 1 && /^(Verde|Giallo|Rosso)/.test(String(data.cell.raw))) {
          const cls = String(data.cell.raw).split(' ')[0];
          const info = DATA.CLASSI_DANNO[cls];
          if (info) { const rgb = hexToRgb(info.colore); if (cls !== 'Giallo') data.cell.styles.textColor = rgb; data.cell.styles.fontStyle = 'bold'; }
        }
      }
    });

    const body = cl.voci.map(voce => {
      const val = (v.checklist || {})[voce];
      const txt = val === 'si' ? 'Conforme' : val === 'no' ? 'NON CONFORME' : val === 'na' ? 'N.A.' : '—';
      return [voce, txt];
    });
    d.autoTable({
      startY: d.lastAutoTable.finalY + 4, theme: 'striped', styles: { fontSize: 9 },
      head: [['Requisito verificato', 'Esito']], body,
      headStyles: { fillColor: [13, 71, 45] },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 1) {
          if (data.cell.raw === 'NON CONFORME') { data.cell.styles.textColor = [220, 53, 69]; data.cell.styles.fontStyle = 'bold'; }
          else if (data.cell.raw === 'Conforme') data.cell.styles.textColor = [25, 135, 84];
        }
      }
    });
    let yy = d.lastAutoTable.finalY + 6;
    if (v.note) { d.setFontSize(9); d.setFont('helvetica', 'bold'); d.text('Note:', 14, yy); d.setFont('helvetica', 'normal');
      const lines = d.splitTextToSize(v.note, 180); d.text(lines, 14, yy + 5); yy += 5 + lines.length * 5; }

    // Documentazione fotografica della verifica
    const imgs = (await DB.all('allegati')).filter(a => a.entita === 'verifiche' && a.refId === v.id && a.mime && a.mime.startsWith('image/'));
    if (imgs.length) {
      yy += 6;
      if (yy > 250) { d.addPage(); yy = 20; }
      d.setFont('helvetica', 'bold'); d.setFontSize(11); d.setTextColor(0);
      d.text('Documentazione fotografica', 14, yy); yy += 6;
      let n = 0;
      for (const a of imgs) {
        n++;
        const dim = await imgDims(a);
        let w = 85, h = 85 * (dim.h / dim.w);
        if (h > 85) { h = 85; w = 85 * (dim.w / dim.h); }
        if (yy + h + 10 > 285) { d.addPage(); yy = 20; }
        const fmt = (a.mime && a.mime.includes('png')) ? 'PNG' : 'JPEG';
        try { d.addImage(a.data, fmt, 14, yy, w, h); } catch (e) { /* immagine non incorporabile */ }
        d.setFont('helvetica', 'normal'); d.setFontSize(9);
        const cap = d.splitTextToSize('Foto ' + n + ' — ' + (a.descrizione || '(senza descrizione)'), 190 - (14 + w + 6));
        d.text(cap, 14 + w + 6, yy + 6);
        yy += h + 8;
      }
    }

    if (yy > 250) { d.addPage(); yy = 20; }
    firma(d, yy + 6);
    footer(d);
    d.save((isScaff ? 'verbale_scaffalatura_' : 'verbale_verifica_') + (ctx.bene ? ctx.bene.codice : (ctx.ambiente ? ctx.ambiente.codice : 'x')) + '.pdf');
  }

  async function organigramma() {
    const [figure, sedi] = await Promise.all([DB.all('figure'), DB.all('sedi')]);
    const sMap = {}; sedi.forEach(s => sMap[s.id] = s);
    const ordF = {}; DATA.RUOLI_FIGURE.forEach((r, i) => ordF[r] = i);
    const figOrd = figure.slice().sort((a, b) => (ordF[a.ruolo] - ordF[b.ruolo]) || (a.nominativo || '').localeCompare(b.nominativo || ''));
    const d = doc();
    let y = header(d, 'Organigramma della sicurezza', 'Figure della prevenzione e protezione — D.Lgs. 81/2008');
    d.autoTable({
      startY: y, styles: { fontSize: 8, cellPadding: 1.5 }, theme: 'grid',
      head: [['Ruolo', 'Nominativo', 'Qualifica / Ufficio', 'Sede', 'Contatti', 'Nomina', 'Rif. normativo']],
      body: figOrd.length ? figOrd.map(f => [
        f.ruolo, f.nominativo || '—', f.qualifica || '—',
        f.idSede ? (sMap[f.idSede] ? sMap[f.idSede].nome : '—') : 'Tutte le sedi / Ente',
        [f.email, f.telefono].filter(Boolean).join(' · ') || '—',
        fmtDate(f.dataNomina), DATA.RUOLO_NORMA[f.ruolo] || ''
      ]) : [['—', 'Nessuna figura registrata', '', '', '', '', '']],
      headStyles: { fillColor: [13, 71, 45] }
    });
    footer(d); d.save('organigramma_sicurezza.pdf');
  }

  async function elencoNC() {
    const ncs = (await DB.all('nonconformita')).sort((a, b) => (a.numero || '').localeCompare(b.numero || ''));
    const d = doc();
    let y = header(d, 'Elenco Non Conformità', 'Totale: ' + ncs.length);
    const body = [];
    for (const n of ncs) {
      const loc = await locOf(n);
      body.push([n.numero, fmtDate(n.dataApertura), loc, (n.descrizione || '').slice(0, 60), n.livelloRischio, n.stato, fmtDate(n.dataPrevista)]);
    }
    d.autoTable({
      startY: y, styles: { fontSize: 8, cellPadding: 1.5 }, theme: 'grid',
      head: [['N. NC', 'Apertura', 'Ubicazione', 'Descrizione', 'Rischio', 'Stato', 'Scadenza']],
      body: body.length ? body : [['—', '', '', 'Nessuna NC', '', '', '']],
      headStyles: { fillColor: [13, 71, 45] },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          if (data.cell.raw === 'Alto') data.cell.styles.textColor = [220, 53, 69];
        }
      }
    });
    footer(d); d.save('elenco_non_conformita.pdf');
  }

  async function pianoAzioni() {
    const ncs = (await DB.all('nonconformita')).filter(n => n.stato !== 'Chiusa')
      .sort((a, b) => rank(b.livelloRischio) - rank(a.livelloRischio));
    const d = doc();
    let y = header(d, 'Piano delle Azioni Correttive', 'Non conformità aperte/in corso: ' + ncs.length);
    const body = [];
    for (const n of ncs) {
      const loc = await locOf(n);
      body.push([n.numero, loc, (n.descrizione || '').slice(0, 45), (n.misure || []).join(', '), n.responsabile || '—', fmtDate(n.dataPrevista), n.livelloRischio, n.stato]);
    }
    d.autoTable({
      startY: y, styles: { fontSize: 7.5, cellPadding: 1.5 }, theme: 'grid',
      head: [['N. NC', 'Ubicazione', 'Descrizione', 'Misure', 'Responsabile', 'Scadenza', 'Rischio', 'Stato']],
      body: body.length ? body : [['—', '', 'Nessuna azione aperta', '', '', '', '', '']],
      headStyles: { fillColor: [13, 71, 45] }
    });
    footer(d); d.save('piano_azioni_correttive.pdf');
  }

  async function relazioneFinale(anno) {
    const [sedi, ambienti, beni, verifiche, nc, figure] = await Promise.all([
      DB.all('sedi'), DB.all('ambienti'), DB.all('beni'), DB.all('verifiche'), DB.all('nonconformita'), DB.all('figure')
    ]);
    const sMap = {}; sedi.forEach(s => sMap[s.id] = s);
    const vAnno = verifiche.filter(v => (v.data || '').startsWith(anno));
    const ncAnno = nc.filter(n => (n.dataApertura || '').startsWith(anno));
    const ambVerificati = new Set();
    for (const v of vAnno) { if (v.idAmbiente) ambVerificati.add(v.idAmbiente); }

    const d = doc();
    let y = header(d, 'Relazione finale annuale ' + anno, 'Sicurezza di ambienti, arredi e scaffalature');

    d.setFontSize(11); d.setFont('helvetica', 'bold'); d.text('1. Riferimenti normativi', 14, y + 2);
    d.setFont('helvetica', 'normal'); d.setFontSize(9);
    const rif = d.splitTextToSize('La presente relazione è redatta in conformità al D.Lgs. 81/2008, con particolare riferimento agli artt. 15 (misure generali di tutela), 17 e 18 (obblighi del datore di lavoro e dirigenti), 28 e 29 (valutazione dei rischi), 63 e 64 (requisiti e obblighi relativi ai luoghi di lavoro) e all\'Allegato IV (requisiti dei luoghi di lavoro).', 182);
    d.text(rif, 14, y + 8); y = y + 8 + rif.length * 4.5;

    // 2. Organigramma della sicurezza
    d.setFont('helvetica', 'bold'); d.setFontSize(11); d.text('2. Organigramma della sicurezza', 14, y + 4);
    const ordF = {}; DATA.RUOLI_FIGURE.forEach((r, i) => ordF[r] = i);
    const figOrd = figure.slice().sort((a, b) => (ordF[a.ruolo] - ordF[b.ruolo]));
    d.autoTable({
      startY: y + 8, theme: 'grid', styles: { fontSize: 8 },
      head: [['Ruolo', 'Nominativo', 'Qualifica / Ufficio', 'Sede', 'Rif. normativo']],
      body: figOrd.length ? figOrd.map(f => [
        f.ruolo, f.nominativo || '—', f.qualifica || '—',
        f.idSede ? (sMap[f.idSede] ? sMap[f.idSede].nome : '—') : 'Tutte le sedi / Ente',
        DATA.RUOLO_NORMA[f.ruolo] || ''
      ]) : [['—', 'Nessuna figura registrata', '', '', '']],
      headStyles: { fillColor: [13, 71, 45] }
    });
    y = d.lastAutoTable.finalY;
    if (y > 250) { d.addPage(); y = 20; }

    d.setFont('helvetica', 'bold'); d.setFontSize(11); d.text('3. Riepilogo statistico', 14, y + 4);
    const esiti = { 'Conforme': 0, 'Conforme con prescrizioni': 0, 'Non conforme': 0 };
    vAnno.forEach(v => { if (esiti[v.esito] !== undefined) esiti[v.esito]++; });
    d.autoTable({
      startY: y + 8, theme: 'grid', styles: { fontSize: 9 },
      head: [['Indicatore', 'Valore']],
      body: [
        ['Sedi censite', String(sedi.length)],
        ['Ambienti censiti', String(ambienti.length)],
        ['Ambienti verificati nell\'anno', String(ambVerificati.size)],
        ['Beni controllati (verifiche nell\'anno)', String(vAnno.length)],
        ['Esito Conforme', String(esiti['Conforme'])],
        ['Esito Conforme con prescrizioni', String(esiti['Conforme con prescrizioni'])],
        ['Esito Non conforme', String(esiti['Non conforme'])],
        ['Non conformità aperte nell\'anno', String(ncAnno.length)],
        ['NC chiuse', String(ncAnno.filter(n => n.stato === 'Chiusa').length)]
      ],
      headStyles: { fillColor: [13, 71, 45] }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 110 } }
    });

    // 4. Criticità riscontrate
    y = d.lastAutoTable.finalY + 6;
    if (y > 250) { d.addPage(); y = 20; }
    d.setFont('helvetica', 'bold'); d.setFontSize(11); d.text('4. Criticità riscontrate', 14, y);
    const crit = [];
    for (const n of ncAnno.filter(x => x.livelloRischio === 'Alto' || x.stato !== 'Chiusa')) {
      crit.push([n.numero, await locOf(n), (n.descrizione || '').slice(0, 55), n.livelloRischio, n.stato]);
    }
    d.autoTable({
      startY: y + 4, styles: { fontSize: 8 }, theme: 'striped',
      head: [['N. NC', 'Ubicazione', 'Descrizione', 'Rischio', 'Stato']],
      body: crit.length ? crit : [['—', '', 'Nessuna criticità rilevante', '', '']],
      headStyles: { fillColor: [13, 71, 45] }
    });

    // 5. Azioni correttive adottate
    y = d.lastAutoTable.finalY + 6;
    if (y > 250) { d.addPage(); y = 20; }
    d.setFont('helvetica', 'bold'); d.setFontSize(11); d.text('5. Azioni correttive adottate', 14, y);
    const az = [];
    for (const n of ncAnno) {
      if ((n.misure || []).length || n.responsabile)
        az.push([n.numero, (n.misure || []).join(', ') || '—', n.responsabile || '—', n.stato, fmtDate(n.dataChiusura)]);
    }
    d.autoTable({
      startY: y + 4, styles: { fontSize: 8 }, theme: 'grid',
      head: [['N. NC', 'Misure adottate', 'Responsabile', 'Stato', 'Chiusura']],
      body: az.length ? az : [['—', 'Nessuna azione registrata', '', '', '']],
      headStyles: { fillColor: [13, 71, 45] }
    });

    let yy = d.lastAutoTable.finalY + 10;
    if (yy > 250) { d.addPage(); yy = 30; }
    d.setFont('helvetica', 'normal'); d.setFontSize(9);
    d.text('La presente relazione attesta le attività di censimento, verifica e monitoraggio svolte nel periodo di riferimento.', 14, yy);
    firma(d, yy + 4);
    footer(d);
    d.save('relazione_finale_' + anno + '.pdf');
  }

  // ---------- Relazione finale in Word (.docx) con documentazione fotografica ----------
  function imgDims(a) {
    if (a.w && a.h) return Promise.resolve({ w: a.w, h: a.h });
    return new Promise(res => {
      const im = new Image();
      im.onload = () => res({ w: im.naturalWidth || 450, h: im.naturalHeight || 338 });
      im.onerror = () => res({ w: 450, h: 338 });
      im.src = a.data;
    });
  }

  function dxTable(headers, rows) {
    const D = docx;
    const head = new D.TableRow({
      tableHeader: true,
      children: headers.map(h => new D.TableCell({
        shading: { fill: '0D472D' },
        children: [new D.Paragraph({ children: [new D.TextRun({ text: h, bold: true, color: 'FFFFFF', size: 18 })] })]
      }))
    });
    const body = rows.map(r => new D.TableRow({
      children: r.map(c => new D.TableCell({
        children: [new D.Paragraph({ children: [new D.TextRun({ text: String(c == null ? '' : c), size: 18 })] })]
      }))
    }));
    return new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [head, ...body] });
  }

  async function relazioneFinaleDocx(anno) {
    if (typeof docx === 'undefined') throw new Error('Libreria Word non caricata.');
    const D = docx;
    const [sedi, ambienti, beni, verifiche, nc, figure, allegati] = await Promise.all([
      DB.all('sedi'), DB.all('ambienti'), DB.all('beni'), DB.all('verifiche'),
      DB.all('nonconformita'), DB.all('figure'), DB.all('allegati')
    ]);
    const sMap = {}; sedi.forEach(s => sMap[s.id] = s);
    const vAnno = verifiche.filter(v => (v.data || '').startsWith(anno));
    const ncAnno = nc.filter(n => (n.dataApertura || '').startsWith(anno));
    const ambVerificati = new Set(); vAnno.forEach(v => { if (v.idAmbiente) ambVerificati.add(v.idAmbiente); });
    const esiti = { 'Conforme': 0, 'Conforme con prescrizioni': 0, 'Non conforme': 0 };
    vAnno.forEach(v => { if (esiti[v.esito] !== undefined) esiti[v.esito]++; });

    const H1 = t => new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 }, children: [new D.TextRun({ text: t, bold: true, color: '0D472D' })] });
    const H2 = t => new D.Paragraph({ heading: D.HeadingLevel.HEADING_2, spacing: { before: 160, after: 60 }, children: [new D.TextRun({ text: t, bold: true })] });
    const P = t => new D.Paragraph({ spacing: { after: 80 }, children: [new D.TextRun({ text: t, size: 20 })] });

    const children = [];
    children.push(new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ text: 'Relazione finale annuale ' + anno, bold: true, size: 34, color: '0D472D' })] }));
    children.push(new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { after: 200 }, children: [new D.TextRun({ text: 'Sicurezza di ambienti, arredi e scaffalature — D.Lgs. 81/2008', italics: true, size: 20 })] }));

    children.push(H1('1. Riferimenti normativi'));
    children.push(P('La presente relazione è redatta in conformità al D.Lgs. 81/2008, con particolare riferimento agli artt. 15 (misure generali di tutela), 17 e 18 (obblighi del datore di lavoro e dirigenti), 28 e 29 (valutazione dei rischi), 63 e 64 (requisiti e obblighi relativi ai luoghi di lavoro) e all\'Allegato IV (requisiti dei luoghi di lavoro).'));

    children.push(H1('2. Organigramma della sicurezza'));
    const ordF = {}; DATA.RUOLI_FIGURE.forEach((r, i) => ordF[r] = i);
    const figOrd = figure.slice().sort((a, b) => ordF[a.ruolo] - ordF[b.ruolo]);
    children.push(dxTable(['Ruolo', 'Nominativo', 'Qualifica / Ufficio', 'Sede', 'Rif. normativo'],
      figOrd.length ? figOrd.map(f => [f.ruolo, f.nominativo || '—', f.qualifica || '—',
        f.idSede ? (sMap[f.idSede] ? sMap[f.idSede].nome : '—') : 'Tutte le sedi / Ente', DATA.RUOLO_NORMA[f.ruolo] || ''])
        : [['—', 'Nessuna figura registrata', '', '', '']]));

    children.push(H1('3. Riepilogo statistico'));
    children.push(dxTable(['Indicatore', 'Valore'], [
      ['Sedi censite', sedi.length], ['Ambienti censiti', ambienti.length],
      ['Ambienti verificati nell\'anno', ambVerificati.size], ['Beni controllati (verifiche nell\'anno)', vAnno.length],
      ['Esito Conforme', esiti['Conforme']], ['Esito Conforme con prescrizioni', esiti['Conforme con prescrizioni']],
      ['Esito Non conforme', esiti['Non conforme']], ['Non conformità aperte nell\'anno', ncAnno.length],
      ['NC chiuse', ncAnno.filter(n => n.stato === 'Chiusa').length]
    ]));

    children.push(H1('4. Criticità riscontrate'));
    const crit = [];
    for (const n of ncAnno.filter(x => x.livelloRischio === 'Alto' || x.stato !== 'Chiusa'))
      crit.push([n.numero, await locOf(n), (n.descrizione || '').slice(0, 80), n.livelloRischio, n.stato]);
    children.push(dxTable(['N. NC', 'Ubicazione', 'Descrizione', 'Rischio', 'Stato'],
      crit.length ? crit : [['—', '', 'Nessuna criticità rilevante', '', '']]));

    children.push(H1('5. Azioni correttive adottate'));
    const az = ncAnno.filter(n => (n.misure || []).length || n.responsabile)
      .map(n => [n.numero, (n.misure || []).join(', ') || '—', n.responsabile || '—', n.stato, fmtDate(n.dataChiusura)]);
    children.push(dxTable(['N. NC', 'Misure adottate', 'Responsabile', 'Stato', 'Chiusura'],
      az.length ? az : [['—', 'Nessuna azione registrata', '', '', '']]));

    // 6. Documentazione fotografica
    children.push(H1('6. Documentazione fotografica'));
    const imgByV = {};
    allegati.filter(a => a.entita === 'verifiche' && a.mime && a.mime.startsWith('image/'))
      .forEach(a => { (imgByV[a.refId] = imgByV[a.refId] || []).push(a); });
    const vWithPhotos = vAnno.filter(v => imgByV[v.id] && imgByV[v.id].length);
    if (!vWithPhotos.length) {
      children.push(P('Nessuna fotografia associata alle verifiche del periodo.'));
    }
    let fotoN = 0;
    for (const v of vWithPhotos) {
      const ctx = await contextOfVerifica(v);
      children.push(H2(ctx.label));
      children.push(P('Data: ' + fmtDate(v.data) + ' · Verificatore: ' + (v.verificatore || '—') + ' · Esito: ' + (v.esito || '—')));
      if (v.note) children.push(P('Note: ' + v.note));
      for (const a of imgByV[v.id]) {
        fotoN++;
        const dim = await imgDims(a);
        const maxW = 440, scale = Math.min(1, maxW / dim.w);
        try {
          children.push(new D.Paragraph({
            spacing: { before: 80 },
            children: [new D.ImageRun({ data: U.dataURLtoBytes(a.data), transformation: { width: Math.round(dim.w * scale), height: Math.round(dim.h * scale) } })]
          }));
        } catch (e) { /* immagine non incorporabile: salta */ }
        children.push(new D.Paragraph({ spacing: { after: 140 }, children: [new D.TextRun({ text: 'Foto ' + fotoN + ' — ' + (a.descrizione || '(senza descrizione)'), italics: true, size: 18 })] }));
      }
    }

    children.push(new D.Paragraph({ spacing: { before: 400 }, children: [new D.TextRun({ text: 'Il Verificatore  ______________________________', size: 20 })] }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: 'Data e firma', size: 16, color: '888888' })] }));

    const doc = new D.Document({
      creator: 'Sicurezza 81', title: 'Relazione finale ' + anno,
      sections: [{ properties: {}, children }]
    });
    const blob = await D.Packer.toBlob(doc);
    U.downloadBlob(blob, 'relazione_finale_' + anno + '.docx');
  }

  function rank(l) { return { 'Alto': 3, 'Medio': 2, 'Basso': 1 }[l] || 0; }
  async function locOf(n) {
    if (n.idBene) { const b = await DB.get('beni', n.idBene); if (b) { const p = await pathOfAmbiente(b.idAmbiente); return p.label + ' › ' + b.codice; } }
    if (n.idAmbiente) { const p = await pathOfAmbiente(n.idAmbiente); return p.label; }
    return '—';
  }

  // ---------- Pagina Report ----------
  async function renderPage() {
    const main = document.getElementById('main');
    const year = new Date().getFullYear();
    const years = []; for (let i = 0; i < 6; i++) years.push(year - i);
    main.innerHTML = `
      <h4 class="mb-3">Report e Verbali (PDF)</h4>
      <div class="row g-3">
        <div class="col-md-6"><div class="card h-100"><div class="card-body">
          <h6>📄 Verbale di verifica (ambiente / scaffalatura)</h6>
          <p class="text-muted small">Seleziona una verifica registrata per generare il verbale.</p>
          <button class="btn btn-outline-primary btn-sm" id="r-verbale">Seleziona verifica…</button>
        </div></div></div>
        <div class="col-md-6"><div class="card h-100"><div class="card-body">
          <h6>👥 Organigramma della sicurezza</h6>
          <p class="text-muted small">Elenco delle figure D.Lgs. 81/2008 con ruoli e riferimenti.</p>
          <button class="btn btn-outline-primary btn-sm" id="r-organigramma">Genera PDF</button>
        </div></div></div>
        <div class="col-md-6"><div class="card h-100"><div class="card-body">
          <h6>📋 Elenco non conformità</h6>
          <p class="text-muted small">Report tabellare di tutte le NC.</p>
          <button class="btn btn-outline-primary btn-sm" id="r-elenco">Genera PDF</button>
        </div></div></div>
        <div class="col-md-6"><div class="card h-100"><div class="card-body">
          <h6>🛠️ Piano azioni correttive</h6>
          <p class="text-muted small">NC aperte/in corso ordinate per rischio.</p>
          <button class="btn btn-outline-primary btn-sm" id="r-piano">Genera PDF</button>
        </div></div></div>
        <div class="col-md-6"><div class="card h-100 border-success"><div class="card-body">
          <h6>📑 Relazione finale annuale</h6>
          <p class="text-muted small">Relazione completa (riferimenti normativi, organigramma, statistiche, criticità, azioni)
            e <strong>documentazione fotografica</strong> con le descrizioni inserite nelle verifiche.
            La versione <strong>Word</strong> è modificabile prima dell'invio.</p>
          <div class="input-group input-group-sm">
            <select class="form-select" id="r-anno" style="max-width:110px">${options(years)}</select>
            <button class="btn btn-success" id="r-relazione-docx">📝 Word (.docx)</button>
            <button class="btn btn-outline-primary" id="r-relazione">PDF</button>
          </div>
        </div></div></div>
      </div>
      <hr>
      <h6>Esportazioni dati</h6>
      <button class="btn btn-outline-success btn-sm" id="r-xls">Esporta tutto in Excel (.xlsx)</button>`;

    document.getElementById('r-verbale').onclick = selectVerbale;
    document.getElementById('r-organigramma').onclick = () => run(organigramma);
    document.getElementById('r-elenco').onclick = () => run(elencoNC);
    document.getElementById('r-piano').onclick = () => run(pianoAzioni);
    document.getElementById('r-relazione').onclick = () => run(() => relazioneFinale(document.getElementById('r-anno').value));
    document.getElementById('r-relazione-docx').onclick = () => run(() => relazioneFinaleDocx(document.getElementById('r-anno').value));
    document.getElementById('r-xls').onclick = Exports.excel;
  }

  async function run(fn) {
    try { await fn(); toast('PDF generato.', 'success'); }
    catch (e) { console.error(e); toast('Errore nella generazione: ' + e.message, 'danger'); }
  }

  async function selectVerbale() {
    const verifiche = (await DB.all('verifiche')).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    if (!verifiche.length) { toast('Nessuna verifica disponibile.', 'warning'); return; }
    const opts = [];
    for (const v of verifiche) {
      const ctx = await contextOfVerifica(v);
      opts.push({ value: v.id, label: fmtDate(v.data) + ' · ' + ctx.label + ' · ' + (v.esito || '') });
    }
    const res = await modal({
      title: 'Seleziona verifica', size: 'md',
      body: `<select class="form-select" id="sv">${options(opts)}</select>`, okText: 'Genera verbale'
    });
    if (!res) return;
    const v = await DB.get('verifiche', res.querySelector('#sv').value);
    run(() => verbaleVerifica(v));
  }

  global.Reports = { renderPage, verbaleVerifica, organigramma, elencoNC, pianoAzioni, relazioneFinale, relazioneFinaleDocx };
})(window);
