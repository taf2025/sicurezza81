/* ============================================================
   dashboard.js — Cruscotto: contatori e grafici (Chart.js)
   ============================================================ */
(function (global) {
  'use strict';
  const { esc } = U;
  let charts = [];

  function destroyCharts() { charts.forEach(c => c.destroy()); charts = []; }

  async function render() {
    destroyCharts();
    const main = document.getElementById('main');
    const [sedi, ambienti, beni, verifiche, nc] = await Promise.all([
      DB.all('sedi'), DB.all('ambienti'), DB.all('beni'), DB.all('verifiche'), DB.all('nonconformita')
    ]);

    const ncAperte = nc.filter(n => n.stato !== 'Chiusa').length;
    const ncChiuse = nc.filter(n => n.stato === 'Chiusa').length;

    const card = (label, val, cls, view) =>
      `<div class="col-6 col-lg-2">
        <div class="card kpi ${cls} h-100" role="button" data-nav="${view || ''}">
          <div class="card-body text-center py-3">
            <div class="kpi-val">${val}</div><div class="kpi-lbl">${esc(label)}</div>
          </div></div></div>`;

    let html = `<h4 class="mb-3">Dashboard</h4>
      <div class="row g-2 mb-4">
        ${card('Sedi', sedi.length, 'k-blue', 'sedi')}
        ${card('Ambienti', ambienti.length, 'k-blue', 'ambienti')}
        ${card('Beni censiti', beni.length, 'k-blue', 'beni')}
        ${card('Verifiche', verifiche.length, 'k-green', 'verifiche')}
        ${card('NC aperte', ncAperte, 'k-red', 'nonconformita')}
        ${card('NC chiuse', ncChiuse, 'k-grey', 'nonconformita')}
      </div>
      <div id="scad-box" class="mb-3"></div>
      <div class="row g-3">
        <div class="col-lg-6"><div class="card"><div class="card-body">
          <h6 class="card-title">Esiti verifiche</h6><canvas id="ch-esiti" height="180"></canvas></div></div></div>
        <div class="col-lg-6"><div class="card"><div class="card-body">
          <h6 class="card-title">NC per livello di rischio</h6><canvas id="ch-rischio" height="180"></canvas></div></div></div>
        <div class="col-lg-6"><div class="card"><div class="card-body">
          <h6 class="card-title">NC per sede</h6><canvas id="ch-sede" height="180"></canvas></div></div></div>
        <div class="col-lg-6"><div class="card"><div class="card-body">
          <h6 class="card-title">Scaffalature per classe di danno (UNI EN 15635)</h6><canvas id="ch-scaff" height="180"></canvas></div></div></div>
      </div>`;
    main.innerHTML = html;
    main.querySelectorAll('[data-nav]').forEach(c => c.onclick = () => { if (c.dataset.nav) go(c.dataset.nav); });

    // ---- Grafico esiti verifiche ----
    const esitiCount = { 'Conforme': 0, 'Conforme con prescrizioni': 0, 'Non conforme': 0 };
    verifiche.forEach(v => { if (esitiCount[v.esito] !== undefined) esitiCount[v.esito]++; });
    charts.push(new Chart(document.getElementById('ch-esiti'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(esitiCount),
        datasets: [{ data: Object.values(esitiCount), backgroundColor: ['#198754', '#ffc107', '#dc3545'] }]
      },
      options: chartOpts()
    }));

    // ---- NC per rischio ----
    const risc = { 'Alto': 0, 'Medio': 0, 'Basso': 0 };
    nc.forEach(n => { if (risc[n.livelloRischio] !== undefined) risc[n.livelloRischio]++; });
    charts.push(new Chart(document.getElementById('ch-rischio'), {
      type: 'bar',
      data: { labels: Object.keys(risc), datasets: [{ label: 'NC', data: Object.values(risc), backgroundColor: ['#dc3545', '#ffc107', '#0dcaf0'] }] },
      options: chartOpts(true)
    }));

    // ---- NC per sede ----
    const bySede = {};
    for (const n of nc) {
      const s = await sedeOfNc(n);
      const key = s ? s.nome : 'Non assegnata';
      bySede[key] = (bySede[key] || 0) + 1;
    }
    const sedeLabels = Object.keys(bySede);
    charts.push(new Chart(document.getElementById('ch-sede'), {
      type: 'bar',
      data: { labels: sedeLabels.length ? sedeLabels : ['—'], datasets: [{ label: 'NC', data: sedeLabels.length ? Object.values(bySede) : [0], backgroundColor: '#0d6efd' }] },
      options: chartOpts(true)
    }));

    // ---- Scaffalature per classe di danno (UNI EN 15635) ----
    const scaffBeni = new Set(beni.filter(b => b.categoria === 'Scaffalatura metallica').map(b => b.id));
    const lastByBene = {};
    verifiche.filter(v => v.idBene && scaffBeni.has(v.idBene)).forEach(v => {
      if (!lastByBene[v.idBene] || (v.data || '') > (lastByBene[v.idBene].data || '')) lastByBene[v.idBene] = v;
    });
    const classe = { 'Verde': 0, 'Giallo': 0, 'Rosso': 0, 'Non classificato': 0 };
    Object.values(lastByBene).forEach(v => {
      if (classe[v.classeDanno] !== undefined) classe[v.classeDanno]++; else classe['Non classificato']++;
    });
    charts.push(new Chart(document.getElementById('ch-scaff'), {
      type: 'doughnut',
      data: {
        labels: ['🟢 Verde', '🟡 Giallo', '🔴 Rosso', 'Non classificato'],
        datasets: [{ data: [classe['Verde'], classe['Giallo'], classe['Rosso'], classe['Non classificato']], backgroundColor: ['#198754', '#ffc107', '#dc3545', '#adb5bd'] }]
      },
      options: chartOpts()
    }));

    // ---- Scadenzario verifiche (UNI EN 15635: ≤12 mesi) ----
    renderScadenze(document.getElementById('scad-box'), verifiche, beni);
  }

  // Ultima verifica per bene, evidenzia scadute o in scadenza (≤30 gg)
  async function renderScadenze(box, verifiche, beni) {
    if (!box) return;
    const beneMap = {}; beni.forEach(b => beneMap[b.id] = b);
    const last = {};
    verifiche.filter(v => v.idBene && v.prossimaVerifica).forEach(v => {
      if (!last[v.idBene] || (v.data || '') > (last[v.idBene].data || '')) last[v.idBene] = v;
    });
    const today = U.todayISO();
    const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const scadute = [], inScadenza = [];
    Object.values(last).forEach(v => {
      if (v.prossimaVerifica < today) scadute.push(v);
      else if (v.prossimaVerifica <= soon) inScadenza.push(v);
    });
    if (!scadute.length && !inScadenza.length) { box.innerHTML = ''; return; }
    const row = (v, cls) => {
      const b = beneMap[v.idBene];
      return `<li class="list-group-item d-flex justify-content-between align-items-center py-1">
        <span>${U.esc(b ? b.codice + ' · ' + (b.categoria || '') : '—')}</span>
        <span class="badge ${cls}">${U.fmtDate(v.prossimaVerifica)}</span></li>`;
    };
    box.innerHTML = `<div class="card border-warning"><div class="card-body py-2">
      <h6 class="card-title mb-2">⏰ Scadenzario verifiche
        <span class="badge bg-danger">${scadute.length} scadute</span>
        <span class="badge bg-warning text-dark">${inScadenza.length} in scadenza (≤30 gg)</span></h6>
      <ul class="list-group list-group-flush small">
        ${scadute.map(v => row(v, 'bg-danger')).join('')}
        ${inScadenza.map(v => row(v, 'bg-warning text-dark')).join('')}
      </ul>
      <button class="btn btn-sm btn-outline-primary mt-2" id="scad-goto">Vai alle verifiche</button>
    </div></div>`;
    const btn = box.querySelector('#scad-goto');
    if (btn) btn.onclick = () => go('verifiche');
  }

  async function sedeOfNc(n) {
    let idAmb = n.idAmbiente;
    if (!idAmb && n.idBene) { const b = await DB.get('beni', n.idBene); idAmb = b ? b.idAmbiente : null; }
    if (!idAmb) return null;
    const p = await pathOfAmbiente(idAmb);
    return p.sede;
  }

  function chartOpts(noLegend) {
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: !noLegend, position: 'bottom' } },
      scales: noLegend ? { y: { beginAtZero: true, ticks: { precision: 0 } } } : {}
    };
  }

  global.Dashboard = { render };
})(window);
