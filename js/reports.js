/* ============================================================
   reports.js — Generazione report PDF (jsPDF) e Word (.docx)
   Colori neutri (testo nero, intestazioni tabella grigie).
   ============================================================ */
(function (global) {
  'use strict';
  const { esc, toast, modal, fmtDate, options } = U;

  // ---------------- Helper PDF ----------------
  function doc() {
    const { jsPDF } = window.jspdf;
    return new jsPDF({ unit: 'mm', format: 'a4' });
  }

  // Stile intestazione tabelle: grigio chiaro, testo nero
  const TH = { fillColor: [235, 235, 235], textColor: [0, 0, 0], fontStyle: 'bold', lineColor: [180, 180, 180], lineWidth: 0.1 };
  const GRID = { lineColor: [200, 200, 200], lineWidth: 0.1 };

  function header(d, titolo, sottotitolo) {
    d.setTextColor(0);
    d.setFont('helvetica', 'bold'); d.setFontSize(11);
    d.text('Sicurezza Ambienti di Lavoro', 14, 14);
    d.setFont('helvetica', 'normal'); d.setFontSize(8);
    d.text('D.Lgs. 81/2008 — artt. 15,17,18,28,29,63,64 e Allegato IV', 14, 19);
    d.setDrawColor(180); d.setLineWidth(0.3); d.line(14, 22, 196, 22);
    d.setFont('helvetica', 'bold'); d.setFontSize(14);
    d.text(titolo, 14, 31);
    if (sottotitolo) { d.setFont('helvetica', 'normal'); d.setFontSize(10); d.text(sottotitolo, 14, 37); }
    return sottotitolo ? 43 : 39;
  }

  function footer(d) {
    const pages = d.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      d.setPage(i); d.setFont('helvetica', 'normal'); d.setFontSize(8); d.setTextColor(120);
      d.text('Generato il ' + new Date().toLocaleString('it-IT'), 14, 290);
      d.text('Pag. ' + i + '/' + pages, 196, 290, { align: 'right' });
      d.setTextColor(0);
    }
  }

  function firma(d, y) {
    d.setTextColor(0); d.setFont('helvetica', 'normal'); d.setFontSize(10);
    d.text('Il Verificatore', 140, y + 16);
    d.setDrawColor(120); d.line(140, y + 26, 196, y + 26);
    return y + 30;
  }

  function imgDims(a) {
    if (a.w && a.h) return Promise.resolve({ w: a.w, h: a.h });
    return new Promise(res => {
      const im = new Image();
      im.onload = () => res({ w: im.naturalWidth || 450, h: im.naturalHeight || 338 });
      im.onerror = () => res({ w: 450, h: 338 });
      im.src = a.data;
    });
  }

  // Aggiunge una sezione fotografica al PDF a partire da y; ritorna il nuovo y.
  async function pdfFotografie(d, y, gruppi) {
    if (!gruppi.length) return y;
    if (y > 250) { d.addPage(); y = 20; }
    d.setFont('helvetica', 'bold'); d.setFontSize(11); d.setTextColor(0);
    d.text('Documentazione fotografica', 14, y); y += 6;
    let n = 0;
    for (const g of gruppi) {
      if (g.titolo) {
        if (y > 265) { d.addPage(); y = 20; }
        d.setFont('helvetica', 'bold'); d.setFontSize(9); d.text(g.titolo, 14, y); y += 5;
      }
      for (const a of g.foto) {
        n++;
        const dim = await imgDims(a);
        let w = 80, h = 80 * (dim.h / dim.w);
        if (h > 80) { h = 80; w = 80 * (dim.w / dim.h); }
        if (y + h + 8 > 285) { d.addPage(); y = 20; }
        const fmt = (a.mime && a.mime.includes('png')) ? 'PNG' : 'JPEG';
        try { d.addImage(a.data, fmt, 14, y, w, h); } catch (e) { /* salta */ }
        d.setFont('helvetica', 'normal'); d.setFontSize(9);
        const cap = d.splitTextToSize('Foto ' + n + ' — ' + (a.descrizione || '(senza descrizione)'), 190 - (14 + w + 6));
        d.text(cap, 14 + w + 6, y + 6);
        y += h + 8;
      }
    }
    return y;
  }

  // ---------------- Helper DOCX ----------------
  function dxTitle(titolo, sottotitolo) {
    const D = docx; const out = [];
    out.push(new D.Paragraph({ children: [new D.TextRun({ text: 'Sicurezza Ambienti di Lavoro', bold: true, size: 20 })] }));
    out.push(new D.Paragraph({ spacing: { after: 100 }, children: [new D.TextRun({ text: 'D.Lgs. 81/2008 — artt. 15,17,18,28,29,63,64 e Allegato IV', italics: true, size: 16 })] }));
    out.push(new D.Paragraph({ spacing: { after: sottotitolo ? 40 : 160 }, children: [new D.TextRun({ text: titolo, bold: true, size: 30 })] }));
    if (sottotitolo) out.push(new D.Paragraph({ spacing: { after: 160 }, children: [new D.TextRun({ text: sottotitolo, size: 20 })] }));
    return out;
  }
  function dxH1(t) { return new docx.Paragraph({ heading: docx.HeadingLevel.HEADING_1, spacing: { before: 220, after: 100 }, children: [new docx.TextRun({ text: t, bold: true })] }); }
  function dxH2(t) { return new docx.Paragraph({ heading: docx.HeadingLevel.HEADING_2, spacing: { before: 140, after: 60 }, children: [new docx.TextRun({ text: t, bold: true })] }); }
  function dxP(t) { return new docx.Paragraph({ spacing: { after: 80 }, children: [new docx.TextRun({ text: t, size: 20 })] }); }

  function dxTable(headers, rows) {
    const D = docx;
    const head = new D.TableRow({
      tableHeader: true,
      children: headers.map(h => new D.TableCell({
        shading: { fill: 'E7E7E7' },
        children: [new D.Paragraph({ children: [new D.TextRun({ text: h, bold: true, size: 18 })] })]
      }))
    });
    const body = rows.map(r => new D.TableRow({
      children: r.map(c => new D.TableCell({
        children: [new D.Paragraph({ children: [new D.TextRun({ text: String(c == null ? '' : c), size: 18 })] })]
      }))
    }));
    return new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [head, ...body] });
  }

  async function dxFoto(a, n) {
    const D = docx; const dim = await imgDims(a);
    const maxW = 440, scale = Math.min(1, maxW / dim.w);
    const kids = [];
    try {
      kids.push(new D.Paragraph({ spacing: { before: 80 }, children: [new D.ImageRun({ data: U.dataURLtoBytes(a.data), transformation: { width: Math.round(dim.w * scale), height: Math.round(dim.h * scale) } })] }));
    } catch (e) { /* salta */ }
    kids.push(new D.Paragraph({ spacing: { after: 140 }, children: [new D.TextRun({ text: 'Foto ' + n + ' — ' + (a.descrizione || '(senza descrizione)'), italics: true, size: 18 })] }));
    return kids;
  }
  function dxFirma() {
    const D = docx;
    return [
      new D.Paragraph({ spacing: { before: 400 }, children: [new D.TextRun({ text: 'Il Verificatore  ______________________________', size: 20 })] }),
      new D.Paragraph({ children: [new D.TextRun({ text: 'Data e firma', size: 16 })] })
    ];
  }
  async function saveDocx(filename, children) {
    if (typeof docx === 'undefined') throw new Error('Libreria Word non caricata.');
    const d = new docx.Document({ creator: 'Sicurezza 81', title: filename, sections: [{ properties: {}, children }] });
    const blob = await docx.Packer.toBlob(d);
    U.downloadBlob(blob, filename);
  }

  // ---------------- Foto: raccolta (verifica + NC collegate) ----------------
  function ncByVerifica(nc) {
    const m = {}; nc.forEach(n => { if (n.idVerifica) (m[n.idVerifica] = m[n.idVerifica] || []).push(n); }); return m;
  }
  function fotoDiVerifica(v, imgAll, ncByV) {
    const out = imgAll.filter(a => a.entita === 'verifiche' && a.refId === v.id);
    (ncByV[v.id] || []).forEach(n => imgAll.filter(a => a.entita === 'nonconformita' && a.refId === n.id).forEach(a => out.push(a)));
    return out;
  }

  // ============================================================
  //  VERBALE DI VERIFICA
  // ============================================================
  async function verbaleData(v) {
    const ctx = await contextOfVerifica(v);
    const cl = DATA.CHECKLIST[v.tipoChecklist];
    const isScaff = v.tipoChecklist === 'scaffalature';
    const info = [
      ['Ubicazione', ctx.label],
      ['Oggetto', ctx.bene ? (ctx.bene.codice + ' — ' + (ctx.bene.categoria || '')) : (ctx.ambiente ? ctx.ambiente.codice + ' (' + (ctx.ambiente.tipologia || '') + ')' : '—')],
      ['Data verifica', fmtDate(v.data)],
      ['Tipo di ispezione', v.tipoIspezione || '—'],
      ['Verificatore', v.verificatore || '—'],
      ['Esito', v.esito || '—']
    ];
    if (isScaff) info.push(['Classe di danno (UNI EN 15635)', v.classeDanno ? (v.classeDanno + (DATA.CLASSI_DANNO[v.classeDanno] ? ' — ' + DATA.CLASSI_DANNO[v.classeDanno].azione : '')) : '—']);
    info.push(['Prossima verifica prevista', fmtDate(v.prossimaVerifica)]);
    const checklist = cl.voci.map(voce => {
      const val = (v.checklist || {})[voce];
      return [voce, val === 'si' ? 'Conforme' : val === 'no' ? 'NON CONFORME' : val === 'na' ? 'N.A.' : '—'];
    });
    const nc = await DB.all('nonconformita');
    const imgAll = (await DB.all('allegati')).filter(a => a.mime && a.mime.startsWith('image/'));
    const foto = fotoDiVerifica(v, imgAll, ncByVerifica(nc));
    return { ctx, cl, isScaff, info, checklist, foto };
  }

  async function verbaleVerificaPdf(v) {
    const { ctx, cl, isScaff, info, checklist, foto } = await verbaleData(v);
    const d = doc();
    let y = header(d, isScaff ? 'Verbale di verifica scaffalature' : (v.idBene ? 'Verbale di verifica bene/arredo' : 'Verbale di verifica ambiente'), 'Riferimento: ' + cl.norma);
    d.autoTable({ startY: y, theme: 'grid', styles: Object.assign({ fontSize: 9 }, GRID), head: [['Dato', 'Valore']], body: info, headStyles: TH, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } } });
    d.autoTable({
      startY: d.lastAutoTable.finalY + 4, theme: 'grid', styles: Object.assign({ fontSize: 9 }, GRID),
      head: [['Requisito verificato', 'Esito']], body: checklist, headStyles: TH,
      didParseCell: (data) => { if (data.section === 'body' && data.column.index === 1 && data.cell.raw === 'NON CONFORME') data.cell.styles.fontStyle = 'bold'; }
    });
    let yy = d.lastAutoTable.finalY + 6;
    if (v.note) { d.setFont('helvetica', 'bold'); d.setFontSize(9); d.text('Note:', 14, yy); d.setFont('helvetica', 'normal'); const lines = d.splitTextToSize(v.note, 180); d.text(lines, 14, yy + 5); yy += 5 + lines.length * 5; }
    yy = await pdfFotografie(d, yy + 4, foto.length ? [{ foto }] : []);
    if (yy > 255) { d.addPage(); yy = 20; }
    firma(d, yy + 6); footer(d);
    d.save((isScaff ? 'verbale_scaffalatura_' : 'verbale_verifica_') + (ctx.bene ? ctx.bene.codice : (ctx.ambiente ? ctx.ambiente.codice : 'x')) + '.pdf');
  }

  async function verbaleVerificaDocx(v) {
    const { ctx, cl, isScaff, info, checklist, foto } = await verbaleData(v);
    const children = dxTitle(isScaff ? 'Verbale di verifica scaffalature' : (v.idBene ? 'Verbale di verifica bene/arredo' : 'Verbale di verifica ambiente'), 'Riferimento: ' + cl.norma);
    children.push(dxTable(['Dato', 'Valore'], info));
    children.push(dxH2(cl.titolo));
    children.push(dxTable(['Requisito verificato', 'Esito'], checklist));
    if (v.note) { children.push(dxH2('Note')); children.push(dxP(v.note)); }
    if (foto.length) {
      children.push(dxH2('Documentazione fotografica'));
      let n = 0; for (const a of foto) { n++; (await dxFoto(a, n)).forEach(p => children.push(p)); }
    }
    dxFirma().forEach(p => children.push(p));
    await saveDocx((isScaff ? 'verbale_scaffalatura_' : 'verbale_verifica_') + (ctx.bene ? ctx.bene.codice : (ctx.ambiente ? ctx.ambiente.codice : 'x')) + '.docx', children);
  }

  // ============================================================
  //  ORGANIGRAMMA
  // ============================================================
  async function organigrammaRows() {
    const [figure, sedi] = await Promise.all([DB.all('figure'), DB.all('sedi')]);
    const sMap = {}; sedi.forEach(s => sMap[s.id] = s);
    const ordF = {}; DATA.RUOLI_FIGURE.forEach((r, i) => ordF[r] = i);
    const figOrd = figure.slice().sort((a, b) => (ordF[a.ruolo] - ordF[b.ruolo]) || (a.nominativo || '').localeCompare(b.nominativo || ''));
    return figOrd.map(f => [f.ruolo, f.nominativo || '—', f.qualifica || '—',
      f.idSede ? (sMap[f.idSede] ? sMap[f.idSede].nome : '—') : 'Tutte le sedi / Ente',
      [f.email, f.telefono].filter(Boolean).join(' · ') || '—', fmtDate(f.dataNomina), DATA.RUOLO_NORMA[f.ruolo] || '']);
  }
  async function organigrammaPdf() {
    const rows = await organigrammaRows();
    const d = doc();
    let y = header(d, 'Organigramma della sicurezza', 'Figure della prevenzione e protezione — D.Lgs. 81/2008');
    d.autoTable({ startY: y, styles: Object.assign({ fontSize: 8, cellPadding: 1.5 }, GRID), theme: 'grid',
      head: [['Ruolo', 'Nominativo', 'Qualifica / Ufficio', 'Sede', 'Contatti', 'Nomina', 'Rif. normativo']],
      body: rows.length ? rows : [['—', 'Nessuna figura registrata', '', '', '', '', '']], headStyles: TH });
    footer(d); d.save('organigramma_sicurezza.pdf');
  }
  async function organigrammaDocx() {
    const rows = await organigrammaRows();
    const children = dxTitle('Organigramma della sicurezza', 'Figure della prevenzione e protezione — D.Lgs. 81/2008');
    children.push(dxTable(['Ruolo', 'Nominativo', 'Qualifica / Ufficio', 'Sede', 'Contatti', 'Nomina', 'Rif. normativo'],
      rows.length ? rows : [['—', 'Nessuna figura registrata', '', '', '', '', '']]));
    await saveDocx('organigramma_sicurezza.docx', children);
  }

  // ============================================================
  //  ELENCO NON CONFORMITÀ
  // ============================================================
  async function elencoNcRows() {
    const ncs = (await DB.all('nonconformita')).sort((a, b) => (a.numero || '').localeCompare(b.numero || ''));
    const rows = [];
    for (const n of ncs) rows.push([n.numero, fmtDate(n.dataApertura), await locOf(n), (n.descrizione || '').slice(0, 60), n.livelloRischio, n.stato, fmtDate(n.dataPrevista)]);
    return rows;
  }
  async function elencoNcPdf() {
    const rows = await elencoNcRows();
    const d = doc();
    let y = header(d, 'Elenco Non Conformità', 'Totale: ' + rows.length);
    d.autoTable({ startY: y, styles: Object.assign({ fontSize: 8, cellPadding: 1.5 }, GRID), theme: 'grid',
      head: [['N. NC', 'Apertura', 'Ubicazione', 'Descrizione', 'Rischio', 'Stato', 'Scadenza']],
      body: rows.length ? rows : [['—', '', '', 'Nessuna NC', '', '', '']], headStyles: TH });
    footer(d); d.save('elenco_non_conformita.pdf');
  }
  async function elencoNcDocx() {
    const rows = await elencoNcRows();
    const children = dxTitle('Elenco Non Conformità', 'Totale: ' + rows.length);
    children.push(dxTable(['N. NC', 'Apertura', 'Ubicazione', 'Descrizione', 'Rischio', 'Stato', 'Scadenza'],
      rows.length ? rows : [['—', '', '', 'Nessuna NC', '', '', '']]));
    await saveDocx('elenco_non_conformita.docx', children);
  }

  // ============================================================
  //  PIANO AZIONI CORRETTIVE
  // ============================================================
  async function pianoAzioniRows() {
    const ncs = (await DB.all('nonconformita')).filter(n => n.stato !== 'Chiusa').sort((a, b) => rank(b.livelloRischio) - rank(a.livelloRischio));
    const rows = [];
    for (const n of ncs) rows.push([n.numero, await locOf(n), (n.descrizione || '').slice(0, 45), (n.misure || []).join(', '), n.responsabile || '—', fmtDate(n.dataPrevista), n.livelloRischio, n.stato]);
    return rows;
  }
  async function pianoAzioniPdf() {
    const rows = await pianoAzioniRows();
    const d = doc();
    let y = header(d, 'Piano delle Azioni Correttive', 'Non conformità aperte/in corso: ' + rows.length);
    d.autoTable({ startY: y, styles: Object.assign({ fontSize: 7.5, cellPadding: 1.5 }, GRID), theme: 'grid',
      head: [['N. NC', 'Ubicazione', 'Descrizione', 'Misure', 'Responsabile', 'Scadenza', 'Rischio', 'Stato']],
      body: rows.length ? rows : [['—', '', 'Nessuna azione aperta', '', '', '', '', '']], headStyles: TH });
    footer(d); d.save('piano_azioni_correttive.pdf');
  }
  async function pianoAzioniDocx() {
    const rows = await pianoAzioniRows();
    const children = dxTitle('Piano delle Azioni Correttive', 'Non conformità aperte/in corso: ' + rows.length);
    children.push(dxTable(['N. NC', 'Ubicazione', 'Descrizione', 'Misure', 'Responsabile', 'Scadenza', 'Rischio', 'Stato'],
      rows.length ? rows : [['—', '', 'Nessuna azione aperta', '', '', '', '', '']]));
    await saveDocx('piano_azioni_correttive.docx', children);
  }

  // ============================================================
  //  RELAZIONE FINALE ANNUALE
  // ============================================================
  async function relazioneData(anno) {
    const [sedi, ambienti, beni, verifiche, nc, figure, allegati] = await Promise.all([
      DB.all('sedi'), DB.all('ambienti'), DB.all('beni'), DB.all('verifiche'), DB.all('nonconformita'), DB.all('figure'), DB.all('allegati')
    ]);
    const sMap = {}; sedi.forEach(s => sMap[s.id] = s);
    const vAnno = verifiche.filter(v => (v.data || '').startsWith(anno));
    const ncAnno = nc.filter(n => (n.dataApertura || '').startsWith(anno));
    const ambVerificati = new Set(); vAnno.forEach(v => { if (v.idAmbiente) ambVerificati.add(v.idAmbiente); });
    const esiti = { 'Conforme': 0, 'Conforme con prescrizioni': 0, 'Non conforme': 0 };
    vAnno.forEach(v => { if (esiti[v.esito] !== undefined) esiti[v.esito]++; });

    const ordF = {}; DATA.RUOLI_FIGURE.forEach((r, i) => ordF[r] = i);
    const figOrd = figure.slice().sort((a, b) => ordF[a.ruolo] - ordF[b.ruolo]);
    const orgRows = figOrd.map(f => [f.ruolo, f.nominativo || '—', f.qualifica || '—',
      f.idSede ? (sMap[f.idSede] ? sMap[f.idSede].nome : '—') : 'Tutte le sedi / Ente', DATA.RUOLO_NORMA[f.ruolo] || '']);
    const statRows = [
      ['Sedi censite', String(sedi.length)], ['Ambienti censiti', String(ambienti.length)],
      ['Ambienti verificati nell\'anno', String(ambVerificati.size)], ['Beni controllati (verifiche nell\'anno)', String(vAnno.length)],
      ['Esito Conforme', String(esiti['Conforme'])], ['Esito Conforme con prescrizioni', String(esiti['Conforme con prescrizioni'])],
      ['Esito Non conforme', String(esiti['Non conforme'])], ['Non conformità aperte nell\'anno', String(ncAnno.length)],
      ['NC chiuse', String(ncAnno.filter(n => n.stato === 'Chiusa').length)]
    ];
    const critRows = [];
    for (const n of ncAnno.filter(x => x.livelloRischio === 'Alto' || x.stato !== 'Chiusa')) critRows.push([n.numero, await locOf(n), (n.descrizione || '').slice(0, 70), n.livelloRischio, n.stato]);
    const azRows = [];
    for (const n of ncAnno) if ((n.misure || []).length || n.responsabile) azRows.push([n.numero, (n.misure || []).join(', ') || '—', n.responsabile || '—', n.stato, fmtDate(n.dataChiusura)]);

    // documentazione fotografica: foto della verifica + delle NC collegate, per le verifiche dell'anno
    const imgAll = allegati.filter(a => a.mime && a.mime.startsWith('image/'));
    const ncByV = ncByVerifica(nc);
    const gruppiFoto = [];
    for (const v of vAnno) {
      const foto = fotoDiVerifica(v, imgAll, ncByV);
      if (foto.length) { const ctx = await contextOfVerifica(v); gruppiFoto.push({ titolo: ctx.label + ' — ' + fmtDate(v.data) + ' · ' + (v.esito || ''), v, foto }); }
    }
    const rif = 'La presente relazione è redatta in conformità al D.Lgs. 81/2008, con particolare riferimento agli artt. 15 (misure generali di tutela), 17 e 18 (obblighi del datore di lavoro e dirigenti), 28 e 29 (valutazione dei rischi), 63 e 64 (requisiti e obblighi relativi ai luoghi di lavoro) e all\'Allegato IV (requisiti dei luoghi di lavoro).';
    return { orgRows, statRows, critRows, azRows, gruppiFoto, rif };
  }

  async function relazioneFinalePdf(anno) {
    const { orgRows, statRows, critRows, azRows, gruppiFoto, rif } = await relazioneData(anno);
    const d = doc();
    let y = header(d, 'Relazione finale annuale ' + anno, 'Sicurezza di ambienti, arredi e scaffalature');
    d.setFont('helvetica', 'bold'); d.setFontSize(11); d.text('1. Riferimenti normativi', 14, y + 2);
    d.setFont('helvetica', 'normal'); d.setFontSize(9);
    const rl = d.splitTextToSize(rif, 182); d.text(rl, 14, y + 8); y = y + 8 + rl.length * 4.5;

    d.setFont('helvetica', 'bold'); d.setFontSize(11); d.text('2. Organigramma della sicurezza', 14, y + 4);
    d.autoTable({ startY: y + 8, theme: 'grid', styles: Object.assign({ fontSize: 8 }, GRID), head: [['Ruolo', 'Nominativo', 'Qualifica / Ufficio', 'Sede', 'Rif. normativo']], body: orgRows.length ? orgRows : [['—', 'Nessuna figura registrata', '', '', '']], headStyles: TH });
    y = d.lastAutoTable.finalY; if (y > 250) { d.addPage(); y = 20; }

    d.setFont('helvetica', 'bold'); d.setFontSize(11); d.text('3. Riepilogo statistico', 14, y + 4);
    d.autoTable({ startY: y + 8, theme: 'grid', styles: Object.assign({ fontSize: 9 }, GRID), head: [['Indicatore', 'Valore']], body: statRows, headStyles: TH, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 110 } } });

    y = d.lastAutoTable.finalY + 6; if (y > 250) { d.addPage(); y = 20; }
    d.setFont('helvetica', 'bold'); d.setFontSize(11); d.text('4. Criticità riscontrate', 14, y);
    d.autoTable({ startY: y + 4, styles: Object.assign({ fontSize: 8 }, GRID), theme: 'grid', head: [['N. NC', 'Ubicazione', 'Descrizione', 'Rischio', 'Stato']], body: critRows.length ? critRows : [['—', '', 'Nessuna criticità rilevante', '', '']], headStyles: TH });

    y = d.lastAutoTable.finalY + 6; if (y > 250) { d.addPage(); y = 20; }
    d.setFont('helvetica', 'bold'); d.setFontSize(11); d.text('5. Azioni correttive adottate', 14, y);
    d.autoTable({ startY: y + 4, styles: Object.assign({ fontSize: 8 }, GRID), theme: 'grid', head: [['N. NC', 'Misure adottate', 'Responsabile', 'Stato', 'Chiusura']], body: azRows.length ? azRows : [['—', 'Nessuna azione registrata', '', '', '']], headStyles: TH });

    // 6. Documentazione fotografica
    y = d.lastAutoTable.finalY + 6; if (y > 250) { d.addPage(); y = 20; }
    d.setFont('helvetica', 'bold'); d.setFontSize(11); d.text('6. Documentazione fotografica', 14, y); y += 6;
    if (!gruppiFoto.length) { d.setFont('helvetica', 'normal'); d.setFontSize(9); d.text('Nessuna fotografia associata alle verifiche del periodo.', 14, y); y += 6; }
    else y = await pdfFotografie(d, y - 6, gruppiFoto);

    let yy = y + 8; if (yy > 250) { d.addPage(); yy = 30; }
    d.setFont('helvetica', 'normal'); d.setFontSize(9);
    d.text('La presente relazione attesta le attività di censimento, verifica e monitoraggio svolte nel periodo di riferimento.', 14, yy);
    firma(d, yy + 4); footer(d);
    d.save('relazione_finale_' + anno + '.pdf');
  }

  async function relazioneFinaleDocx(anno) {
    const { orgRows, statRows, critRows, azRows, gruppiFoto, rif } = await relazioneData(anno);
    const children = [];
    children.push(new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: 'Relazione finale annuale ' + anno, bold: true, size: 34 })] }));
    children.push(new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 200 }, children: [new docx.TextRun({ text: 'Sicurezza di ambienti, arredi e scaffalature — D.Lgs. 81/2008', italics: true, size: 20 })] }));
    children.push(dxH1('1. Riferimenti normativi')); children.push(dxP(rif));
    children.push(dxH1('2. Organigramma della sicurezza'));
    children.push(dxTable(['Ruolo', 'Nominativo', 'Qualifica / Ufficio', 'Sede', 'Rif. normativo'], orgRows.length ? orgRows : [['—', 'Nessuna figura registrata', '', '', '']]));
    children.push(dxH1('3. Riepilogo statistico'));
    children.push(dxTable(['Indicatore', 'Valore'], statRows));
    children.push(dxH1('4. Criticità riscontrate'));
    children.push(dxTable(['N. NC', 'Ubicazione', 'Descrizione', 'Rischio', 'Stato'], critRows.length ? critRows : [['—', '', 'Nessuna criticità rilevante', '', '']]));
    children.push(dxH1('5. Azioni correttive adottate'));
    children.push(dxTable(['N. NC', 'Misure adottate', 'Responsabile', 'Stato', 'Chiusura'], azRows.length ? azRows : [['—', 'Nessuna azione registrata', '', '', '']]));
    children.push(dxH1('6. Documentazione fotografica'));
    if (!gruppiFoto.length) children.push(dxP('Nessuna fotografia associata alle verifiche del periodo.'));
    let n = 0;
    for (const g of gruppiFoto) {
      children.push(dxH2(g.titolo));
      if (g.v.note) children.push(dxP('Note: ' + g.v.note));
      for (const a of g.foto) { n++; (await dxFoto(a, n)).forEach(p => children.push(p)); }
    }
    dxFirma().forEach(p => children.push(p));
    await saveDocx('relazione_finale_' + anno + '.docx', children);
  }

  // ---------------- utilità ----------------
  function rank(l) { return { 'Alto': 3, 'Medio': 2, 'Basso': 1 }[l] || 0; }
  async function locOf(n) {
    if (n.idBene) { const b = await DB.get('beni', n.idBene); if (b) { const p = await pathOfAmbiente(b.idAmbiente); return p.label + ' › ' + b.codice; } }
    if (n.idAmbiente) { const p = await pathOfAmbiente(n.idAmbiente); return p.label; }
    return '—';
  }

  // ---------------- Pagina Report ----------------
  function card(icon, titolo, testo, buttons) {
    return `<div class="col-md-6"><div class="card h-100"><div class="card-body">
      <h6>${icon} ${esc(titolo)}</h6>
      <p class="text-muted small">${testo}</p>
      <div class="d-flex flex-wrap gap-2">${buttons}</div>
    </div></div></div>`;
  }

  async function renderPage() {
    const main = document.getElementById('main');
    const year = new Date().getFullYear();
    const years = []; for (let i = 0; i < 6; i++) years.push(year - i);
    const pdfBtn = (id, lbl) => `<button class="btn btn-outline-primary btn-sm" id="${id}">📄 ${lbl || 'PDF'}</button>`;
    const docBtn = (id, lbl) => `<button class="btn btn-outline-success btn-sm" id="${id}">📝 ${lbl || 'Word'}</button>`;

    main.innerHTML = `
      <h4 class="mb-3">Report e Relazioni</h4>
      <p class="text-muted">Ogni documento è disponibile in <strong>PDF</strong> e in <strong>Word (.docx)</strong> modificabile.</p>
      <div class="row g-3">
        ${card('📝', 'Verbale di verifica', 'Seleziona una verifica registrata (ambiente / bene / scaffalatura), con documentazione fotografica.',
          pdfBtn('r-verbale-pdf', 'Verbale PDF') + docBtn('r-verbale-doc', 'Verbale Word'))}
        ${card('👥', 'Organigramma della sicurezza', 'Elenco delle figure D.Lgs. 81/2008 con ruoli e riferimenti.',
          pdfBtn('r-org-pdf') + docBtn('r-org-doc'))}
        ${card('📋', 'Elenco non conformità', 'Report tabellare di tutte le NC.',
          pdfBtn('r-elenco-pdf') + docBtn('r-elenco-doc'))}
        ${card('🛠️', 'Piano azioni correttive', 'NC aperte/in corso ordinate per rischio.',
          pdfBtn('r-piano-pdf') + docBtn('r-piano-doc'))}
      </div>
      <div class="card mt-3 border-success"><div class="card-body">
        <h6>📑 Relazione finale annuale</h6>
        <p class="text-muted small mb-2">Relazione completa (riferimenti normativi, organigramma, statistiche, criticità, azioni)
          con <strong>documentazione fotografica</strong> (foto delle verifiche e delle non conformità collegate).</p>
        <div class="input-group input-group-sm" style="max-width:360px">
          <span class="input-group-text">Anno</span>
          <select class="form-select" id="r-anno" style="max-width:100px">${options(years)}</select>
          <button class="btn btn-success" id="r-rel-doc">📝 Word (.docx)</button>
          <button class="btn btn-outline-primary" id="r-rel-pdf">📄 PDF</button>
        </div>
      </div></div>
      <hr>
      <h6>Esportazione dati</h6>
      <button class="btn btn-outline-secondary btn-sm" id="r-xls">📊 Esporta tutto in Excel (.xlsx)</button>`;

    const anno = () => document.getElementById('r-anno').value;
    document.getElementById('r-verbale-pdf').onclick = () => selectVerbale('pdf');
    document.getElementById('r-verbale-doc').onclick = () => selectVerbale('docx');
    document.getElementById('r-org-pdf').onclick = () => run(organigrammaPdf);
    document.getElementById('r-org-doc').onclick = () => run(organigrammaDocx);
    document.getElementById('r-elenco-pdf').onclick = () => run(elencoNcPdf);
    document.getElementById('r-elenco-doc').onclick = () => run(elencoNcDocx);
    document.getElementById('r-piano-pdf').onclick = () => run(pianoAzioniPdf);
    document.getElementById('r-piano-doc').onclick = () => run(pianoAzioniDocx);
    document.getElementById('r-rel-pdf').onclick = () => run(() => relazioneFinalePdf(anno()));
    document.getElementById('r-rel-doc').onclick = () => run(() => relazioneFinaleDocx(anno()));
    document.getElementById('r-xls').onclick = Exports.excel;
  }

  async function run(fn) {
    try { await fn(); toast('Documento generato.', 'success'); }
    catch (e) { console.error(e); toast('Errore nella generazione: ' + e.message, 'danger'); }
  }

  async function selectVerbale(format) {
    const verifiche = (await DB.all('verifiche')).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    if (!verifiche.length) { toast('Nessuna verifica disponibile.', 'warning'); return; }
    const opts = [];
    for (const v of verifiche) { const ctx = await contextOfVerifica(v); opts.push({ value: v.id, label: fmtDate(v.data) + ' · ' + ctx.label + ' · ' + (v.esito || '') }); }
    const res = await modal({ title: 'Seleziona verifica', size: 'md', body: `<select class="form-select" id="sv">${options(opts)}</select>`, okText: 'Genera ' + (format === 'docx' ? 'Word' : 'PDF') });
    if (!res) return;
    const v = await DB.get('verifiche', res.querySelector('#sv').value);
    run(() => format === 'docx' ? verbaleVerificaDocx(v) : verbaleVerificaPdf(v));
  }

  global.Reports = {
    renderPage,
    verbaleVerificaPdf, verbaleVerificaDocx, organigrammaPdf, organigrammaDocx,
    elencoNcPdf, elencoNcDocx, pianoAzioniPdf, pianoAzioniDocx,
    relazioneFinalePdf, relazioneFinaleDocx
  };
})(window);
