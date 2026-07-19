/* ============================================================
   db.js — Livello dati IndexedDB (100% locale, nessun server)
   App Sicurezza Ambienti di Lavoro — D.Lgs. 81/2008
   ============================================================ */
(function (global) {
  'use strict';

  const DB_NAME = 'sicurezza81_db';
  const DB_VERSION = 2;

  // Elenco degli object store e relativi indici
  const STORES = {
    sedi:          { keyPath: 'id', indexes: [] },
    edifici:       { keyPath: 'id', indexes: [['idSede', 'idSede']] },
    piani:         { keyPath: 'id', indexes: [['idEdificio', 'idEdificio']] },
    ambienti:      { keyPath: 'id', indexes: [['idPiano', 'idPiano']] },
    beni:          { keyPath: 'id', indexes: [['idAmbiente', 'idAmbiente']] },
    verifiche:     { keyPath: 'id', indexes: [['idBene', 'idBene']] },
    nonconformita: { keyPath: 'id', indexes: [['idVerifica', 'idVerifica'], ['stato', 'stato']] },
    figure:        { keyPath: 'id', indexes: [['idSede', 'idSede'], ['ruolo', 'ruolo']] },
    allegati:      { keyPath: 'id', indexes: [['entita', 'entita'], ['refId', 'refId']] },
    meta:          { keyPath: 'chiave', indexes: [] }
  };

  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        Object.keys(STORES).forEach((name) => {
          if (!db.objectStoreNames.contains(name)) {
            const cfg = STORES[name];
            const store = db.createObjectStore(name, { keyPath: cfg.keyPath });
            cfg.indexes.forEach(([idxName, keyPath]) => {
              store.createIndex(idxName, keyPath, { unique: false });
            });
          }
        });
      };
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function tx(storeNames, mode) {
    return open().then((db) => db.transaction(storeNames, mode));
  }

  // -------- Operatore corrente (perno del DB) --------
  let _operatore = { codice: 'NA', nome: '' };
  function setOperatore(op) { if (op && op.codice) _operatore = { codice: op.codice, nome: op.nome || '' }; }
  function getOperatore() { return _operatore; }

  function uid() {
    const p = (_operatore.codice || 'NA').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'NA';
    return p + '-' + (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase();
  }

  // -------- CRUD generico (con marcatura autore/timestamp) --------
  function add(store, obj) {
    if (store !== 'meta') {
      const now = new Date().toISOString();
      if (!obj.id) obj.id = uid();
      if (!obj.creato) obj.creato = now;
      if (!obj.autore) obj.autore = _operatore.codice;
      obj.aggiornato = now;
      obj.aggiornatoDa = _operatore.codice;
    }
    return putRaw(store, obj);
  }

  function put(store, obj) { return add(store, obj); }

  // Scrittura senza marcatura (per ripristino/merge: preserva i metadati originali)
  function putRaw(store, obj) {
    return tx(store, 'readwrite').then((t) => new Promise((res, rej) => {
      const r = t.objectStore(store).put(obj);
      r.onsuccess = () => res(obj);
      r.onerror = () => rej(r.error);
    }));
  }

  function get(store, id) {
    return tx(store, 'readonly').then((t) => new Promise((res, rej) => {
      const r = t.objectStore(store).get(id);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    }));
  }

  function all(store) {
    return tx(store, 'readonly').then((t) => new Promise((res, rej) => {
      const r = t.objectStore(store).getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    }));
  }

  function where(store, indexName, value) {
    return tx(store, 'readonly').then((t) => new Promise((res, rej) => {
      const idx = t.objectStore(store).index(indexName);
      const r = idx.getAll(value);
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    }));
  }

  function remove(store, id) {
    return tx(store, 'readwrite').then((t) => new Promise((res, rej) => {
      const r = t.objectStore(store).delete(id);
      r.onsuccess = () => res(true);
      r.onerror = () => rej(r.error);
    }));
  }

  function clear(store) {
    return tx(store, 'readwrite').then((t) => new Promise((res, rej) => {
      const r = t.objectStore(store).clear();
      r.onsuccess = () => res(true);
      r.onerror = () => rej(r.error);
    }));
  }

  // -------- Cancellazione a cascata --------
  async function removeCascade(store, id) {
    if (store === 'sedi') {
      const edifici = await where('edifici', 'idSede', id);
      for (const e of edifici) await removeCascade('edifici', e.id);
      const figs = await where('figure', 'idSede', id);
      for (const fg of figs) await remove('figure', fg.id);
    } else if (store === 'edifici') {
      const piani = await where('piani', 'idEdificio', id);
      for (const p of piani) await removeCascade('piani', p.id);
    } else if (store === 'piani') {
      const amb = await where('ambienti', 'idPiano', id);
      for (const a of amb) await removeCascade('ambienti', a.id);
    } else if (store === 'ambienti') {
      const beni = await where('beni', 'idAmbiente', id);
      for (const b of beni) await removeCascade('beni', b.id);
    } else if (store === 'beni') {
      const vs = await where('verifiche', 'idBene', id);
      for (const v of vs) await removeCascade('verifiche', v.id);
    } else if (store === 'verifiche') {
      const ncs = await where('nonconformita', 'idVerifica', id);
      for (const n of ncs) await remove('nonconformita', n.id);
    }
    // rimuovi allegati collegati
    const alleg = await all('allegati');
    for (const a of alleg) {
      if (a.entita === store && a.refId === id) await remove('allegati', a.id);
    }
    return remove(store, id);
  }

  // -------- Backup / Ripristino --------
  async function exportAll() {
    const dump = {
      _app: 'sicurezza81', _version: DB_VERSION, _exportedAt: new Date().toISOString(),
      _operatore: { codice: _operatore.codice, nome: _operatore.nome }, stores: {}
    };
    for (const name of Object.keys(STORES)) {
      dump.stores[name] = await all(name);
    }
    return dump;
  }

  async function importAll(dump, mode) {
    // mode: 'replace' (svuota tutto) | 'merge' (riconciliazione: vince la versione più recente)
    if (!dump || !dump.stores) throw new Error('File di backup non valido.');
    const stats = { added: 0, updated: 0, skipped: 0, conflicts: [] };
    for (const name of Object.keys(STORES)) {
      const keyPath = STORES[name].keyPath;
      const rows = dump.stores[name] || [];
      if (mode === 'replace') {
        await clear(name);
        for (const row of rows) { await putRaw(name, row); stats.added++; }
        continue;
      }
      // merge: non sovrascrivere l'identità operatore locale
      if (name === 'meta') continue;
      for (const row of rows) {
        const id = row[keyPath];
        const ex = await get(name, id);
        if (!ex) { await putRaw(name, row); stats.added++; continue; }
        const tIn = row.aggiornato || row.creato || '';
        const tEx = ex.aggiornato || ex.creato || '';
        if (tIn > tEx) {
          // conflitto reale: entrambi modificati dopo la creazione, da autori diversi
          if (tEx && ex.autore && row.aggiornatoDa && ex.aggiornatoDa && ex.aggiornatoDa !== row.aggiornatoDa)
            stats.conflicts.push({ store: name, id, teniamo: row.aggiornatoDa, scartiamo: ex.aggiornatoDa });
          await putRaw(name, row); stats.updated++;
        } else {
          stats.skipped++;
        }
      }
    }
    return stats;
  }

  global.DB = {
    open, add, put, putRaw, get, all, where, remove, clear, removeCascade,
    exportAll, importAll, uid, setOperatore, getOperatore, STORES
  };
})(window);
