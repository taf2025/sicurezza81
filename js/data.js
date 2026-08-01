// Elenchi di base dell'applicazione: tipologie, categorie, checklist e testi di legge.
(function (global) {
  'use strict';

  const TIPOLOGIE_AMBIENTE = [
    'Ufficio', 'Archivio', 'Corridoio', 'CED', 'Deposito', 'Magazzino',
    'Locale tecnico', 'Sala riunioni', 'Area comune', 'Altro'
  ];

  const CATEGORIE_BENE = [
    'Scaffalatura metallica', 'Armadio', 'Libreria', 'Cassettiera',
    'Parete mobile', 'Rack informatico', 'Arredo tecnico',
    'Attrezzatura ufficio', 'Altro'
  ];

  const ESITI = ['Conforme', 'Conforme con prescrizioni', 'Non conforme'];

  // Classificazione danni scaffalature — UNI EN 15635 (semaforo)
  const CLASSI_DANNO = {
    'Verde':  { colore: '#198754', rischio: 'Basso', giorni: 365, azione: 'Componente idoneo all\'uso — monitoraggio periodico (entro 12 mesi).' },
    'Giallo': { colore: '#ffc107', rischio: 'Medio', giorni: 30,  azione: 'Intervento entro 30 giorni: scarico temporaneo e sostituzione del componente.' },
    'Rosso':  { colore: '#dc3545', rischio: 'Alto',  giorni: 0,   azione: 'Messa fuori servizio immediata: segregare l\'area e scaricare subito.' }
  };

  // Livelli di ispezione — UNI EN 15635
  const TIPI_ISPEZIONE = [
    'Controllo visivo',
    'Ispezione sistematica interna',
    'Ispezione approfondita (tecnico esterno)',
    'Ispezione straordinaria'
  ];

  // Interventi di messa in sicurezza — iter Pubblica Amministrazione (D.Lgs. 36/2023)
  const CATEGORIE_APPALTO = ['Lavori', 'Fornitura e posa'];
  const TIPI_INTERVENTO = ['Riparazione', 'Sostituzione componente', 'Sostituzione integrale', 'Dismissione (fuori uso)'];
  const PROCEDURE_APPALTO = ['Affidamento diretto', 'Procedura negoziata', 'Procedura aperta'];
  const ATTI_PA = ['Determina a contrarre', 'Determina di affidamento', 'Determina urgente (somma urgenza)'];
  const STATI_INTERVENTO = ['Da avviare', 'Determina in corso', 'Affidato', 'In esecuzione', 'Collaudato/Chiuso'];
  // Soglie affidamento diretto (D.Lgs. 36/2023 art. 50). Parametriche: verificare aggiornamenti normativi.
  const SOGLIE_APPALTO = { 'Lavori': 150000, 'Fornitura e posa': 140000 };
  function proceduraDaImporto(categoria, importo) {
    const soglia = SOGLIE_APPALTO[categoria] || 140000;
    const imp = Number(importo) || 0;
    if (imp < soglia) return 'Affidamento diretto';
    if (imp < 1000000) return 'Procedura negoziata';
    return 'Procedura aperta';
  }

  const LIVELLI_RISCHIO = ['Alto', 'Medio', 'Basso'];

  const STATI_NC = ['Aperta', 'In corso', 'Chiusa'];

  const MISURE_IMMEDIATE = [
    'Interdizione area', 'Delimitazione area', 'Sospensione utilizzo',
    'Rimozione materiali', 'Richiesta manutenzione', 'Sostituzione',
    'Intervento tecnico urgente', 'Altro'
  ];

  // Stato del bene — supporta la procedura annuale di messa in fuori uso e dismissione
  const STATI_BENE = ['', 'In uso', 'Da verificare', 'In manutenzione', 'Non conforme', 'Fuori uso', 'Dismesso'];

  const TIPI_ALLEGATO = [
    'Foto verifica', 'Verbale', 'Certificazione',
    'Dichiarazione produttore', 'DVR aggiornato', 'Altro'
  ];

  // Figure della sicurezza (D.Lgs. 81/2008) — ambito Pubblica Amministrazione
  const RUOLI_FIGURE = [
    'Datore di Lavoro',
    'Dirigente',
    'Preposto',
    'RSPP - Responsabile SPP',
    'ASPP - Addetto SPP',
    'Medico Competente',
    'RLS - Rappresentante Lavoratori Sicurezza',
    'Addetto Antincendio/Emergenza',
    'Addetto Primo Soccorso',
    'PRSES - Resp. Sicurezza Attrezzature Stoccaggio',
    'Responsabile scaffalature/archivi',
    'Lavoratore',
    'Altro'
  ];

  // Riferimento normativo sintetico per ciascun ruolo
  const RUOLO_NORMA = {
    'Datore di Lavoro': 'Artt. 2, 17, 18 D.Lgs. 81/2008',
    'Dirigente': 'Artt. 2, 18 D.Lgs. 81/2008',
    'Preposto': 'Artt. 2, 19 D.Lgs. 81/2008',
    'RSPP - Responsabile SPP': 'Artt. 31, 32, 33 D.Lgs. 81/2008',
    'ASPP - Addetto SPP': 'Artt. 31, 32 D.Lgs. 81/2008',
    'Medico Competente': 'Artt. 25, 38, 41 D.Lgs. 81/2008',
    'RLS - Rappresentante Lavoratori Sicurezza': 'Artt. 47, 48, 50 D.Lgs. 81/2008',
    'Addetto Antincendio/Emergenza': 'Artt. 18, 43, 46 D.Lgs. 81/2008',
    'Addetto Primo Soccorso': 'Artt. 18, 45 D.Lgs. 81/2008',
    'PRSES - Resp. Sicurezza Attrezzature Stoccaggio': 'UNI EN 15635 (D.Lgs. 81/2008 artt. 18, 63, 64)',
    'Responsabile scaffalature/archivi': 'Artt. 18, 63, 64, Allegato IV',
    'Lavoratore': 'Artt. 2, 20 D.Lgs. 81/2008',
    'Altro': '—'
  };

  // ======== MODULO PRSES — Scaffalature metalliche (UNI EN 15635) ========

  // Sottotipi di scaffalatura con flag "ambito PRSES" (true = soggetta a verifica PRSES)
  const SOTTOTIPI_SCAFFALATURA = [
    { nome: 'Scaffalatura a ripiani (archivio/leggera)', ambito: true },
    { nome: 'Scaffalatura portapallet (carichi pesanti)', ambito: true },
    { nome: 'Scaffalatura cantilever (materiali lunghi)', ambito: true },
    { nome: 'Scaffalatura drive-in / drive-through', ambito: true },
    { nome: 'Archivio compattabile su basi mobili', ambito: true },
    { nome: 'Armadio metallico da ufficio', ambito: false },
    { nome: 'Armadio spogliatoio', ambito: false },
    { nome: 'Classificatore / cassettiera', ambito: false },
    { nome: 'Scaffalatura non metallica (legno/plastica)', ambito: false }
  ];
  // Restituisce true se il sottotipo rientra nelle verifiche del PRSES
  function ambitoPRSES(sottotipo) {
    const s = SOTTOTIPI_SCAFFALATURA.find((x) => x.nome === sottotipo);
    return s ? s.ambito : false;
  }

  // Checklist ispezione PRSES organizzata in 4 aree. Ogni voce non conforme
  // porta un elenco di azioni prescritte secondo normativa vigente.
  const CHECKLIST_PRSES = [
    {
      area: 'Integrità strutturale',
      voci: [
        { t: 'Montanti e correnti privi di deformazioni/piegature', az: ['Scaricare il livello o la campata interessata', 'Classificare il danno (semaforo UNI EN 15635)', 'Sostituire il componente deformato con ricambio originale'] },
        { t: 'Assenza di danni da urto sui montanti (parti basse)', az: ['Applicare paracolpi/protezioni di base', 'Valutare la sostituzione del montante ammaccato', 'Rivedere la viabilità dei mezzi di movimentazione'] },
        { t: 'Assenza di fessurazioni/cedimenti nelle saldature e nei nodi', az: ['Messa fuori servizio immediata (classe Rosso)', 'Perizia di un tecnico strutturista', 'Sostituzione del componente lesionato'] }
      ]
    },
    {
      area: 'Collegamenti e fissaggi',
      voci: [
        { t: 'Tasselli di ancoraggio a pavimento/parete saldi', az: ['Serrare o sostituire i tasselli allentati', 'Verificare l\'idoneità del supporto (pavimento/parete)', 'Interdire l\'uso fino al ripristino dell\'ancoraggio'] },
        { t: 'Presenza di tutte le spine/gancetti di sicurezza dei correnti', az: ['Installare le spine di sicurezza mancanti', 'Vietare l\'uso della campata priva di spine', 'Verificare che i correnti non siano sganciabili'] },
        { t: 'Piastre di base integre e ben poggiate a terra', az: ['Ripristinare l\'appoggio della piastra', 'Verificare cedimenti/avvallamenti del pavimento', 'Livellare o rinforzare la base'] }
      ]
    },
    {
      area: 'Condizioni di carico e utilizzo',
      voci: [
        { t: 'Carico entro la portata indicata (nessun sovraccarico)', az: ['Ridurre immediatamente il carico entro i limiti', 'Ridistribuire i faldoni sui livelli', 'Aggiornare/affiggere il cartello di portata'] },
        { t: 'Carico stabile e ordinato, senza sporgenze pericolose', az: ['Riordinare il materiale stoccato', 'Rimuovere le sporgenze verso i corridoi', 'Formare il personale sul corretto stoccaggio'] },
        { t: 'Distanza di sicurezza dal soffitto/impianti antincendio', az: ['Abbassare i livelli di stoccaggio', 'Ripristinare le distanze minime da sprinkler/illuminazione', 'Vietare lo stoccaggio sull\'ultimo ripiano se non a norma'] }
      ]
    },
    {
      area: 'Ambiente e sicurezza generale',
      voci: [
        { t: 'Cartelli di portata presenti e leggibili', az: ['Affiggere/ripristinare il cartello di portata a norma', 'Se dati originali persi: perizia per calcolo portata', 'Posizionare il cartello a inizio corsia/blocco'] },
        { t: 'Vie di transito tra le scaffalature libere', az: ['Sgomberare i corridoi da materiale temporaneo', 'Ripristinare la larghezza minima dei passaggi', 'Non ostruire le vie di fuga'] },
        { t: 'Assenza di corrosione/ruggine da umidità o infiltrazioni', az: ['Individuare ed eliminare la fonte di umidità', 'Trattare/sostituire i componenti corrosi', 'Intensificare la frequenza dei controlli (locali interrati)'] }
      ]
    }
  ];
  // Restituisce le azioni prescritte per una voce non conforme (area, indice voce)
  function azioniPrescritte(indiceArea, indiceVoce) {
    const a = CHECKLIST_PRSES[indiceArea];
    return a && a.voci[indiceVoce] ? a.voci[indiceVoce].az : [];
  }

  // Scheda cartello di portata — 6 requisiti obbligatori (UNI EN 15635)
  const CARTELLO_PORTATA = [
    { chiave: 'costruttore', label: 'Identificativo costruttore (nome/logo) e anno di installazione' },
    { chiave: 'portataRipiano', label: 'Portata massima del ripiano (kg, carico uniformemente distribuito)' },
    { chiave: 'portataSpalla', label: 'Portata massima della spalla/campata (kg totali colonna)' },
    { chiave: 'altezzaRipiani', label: 'Altezza/quote dei ripiani (passi di configurazione)' },
    { chiave: 'noteSicurezza', label: 'Note di sicurezza e divieti (arrampicarsi, modificare, segnalare danni)' },
    { chiave: 'riferimenti', label: 'Riferimenti normativi (struttura soggetta a UNI EN 15635)' }
  ];

  // Frequenze di ispezione differenziate (UNI EN 15635 / D.Lgs. 81/2008)
  const FREQUENZE_ISPEZIONE = [
    { livello: 'Controllo visivo immediato', frequenza: 'Continuo (a cura degli utilizzatori)', chi: 'Personale utilizzatore' },
    { livello: 'Controllo visivo periodico', frequenza: 'Settimanale/mensile', chi: 'PRSES' },
    { livello: 'Ispezione settimanale rinforzata (strutture ante-2009 / seminterrati)', frequenza: 'Settimanale', chi: 'PRSES' },
    { livello: 'Ispezione approfondita', frequenza: 'Almeno una volta l\'anno (max 12 mesi)', chi: 'Tecnico esperto esterno certificato' },
    { livello: 'Ispezione straordinaria', frequenza: 'Dopo urti, sismi o modifiche', chi: 'Tecnico qualificato' }
  ];
  // Frequenza consigliata del controllo visivo in base all'epoca/ambiente
  function frequenzaConsigliata(anno, seminterrato) {
    if ((Number(anno) && Number(anno) < 2009) || seminterrato) return 'Settimanale (struttura datata o locale umido/interrato)';
    return 'Settimanale/mensile';
  }

  // Logica strutture ante-2009: genera le azioni da mettere in campo
  function valutazioneAnte2009(anno, opt) {
    opt = opt || {};
    const az = [];
    if (!(Number(anno) && Number(anno) < 2009)) return az;
    az.push('Struttura antecedente a UNI EN 15635:2009 — applicare tutele specifiche.');
    if (opt.docPersa)
      az.push('Documentazione/portata originale assente: incaricare un ingegnere strutturista iscritto all\'albo per rilievo geometrico, verifica spessore acciaio e relazione di calcolo della portata; solo dopo affiggere i cartelli di portata.');
    else
      az.push('Verificare la disponibilità del manuale d\'uso e dei dati di portata del costruttore.');
    if (opt.sismica)
      az.push('Conformità sismica non garantita: valutare nel DVR il rischio di ribaltamento e prevedere adeguamento (croci di controvento di Sant\'Andrea, tassellatura rinforzata a parete/soffitto) per evitare l\'effetto domino.');
    if (opt.modifiche)
      az.push('Modifiche/spostamenti di ripiani nel tempo: ripristinare i passi standard e le spine di sicurezza originali; verificare la stabilità complessiva.');
    az.push('Obblighi comunque vigenti (art. 64 e Allegato IV D.Lgs. 81/2008): nomina PRSES, ispezione annuale di tecnico certificato e controlli visivi settimanali rinforzati (ruggine, micro-fessurazioni).');
    return az;
  }

  // -------- Checklist con riferimenti normativi --------
  const CHECKLIST = {
    scaffalature: {
      titolo: 'Checklist Scaffalature metalliche',
      norma: 'D.Lgs. 81/2008 — Art. 63, 64, Allegato IV (punti 1.1, 1.2)',
      voci: [
        'Documentazione disponibile',
        'Conforme istruzioni produttore',
        'Corretto montaggio',
        'Corretto ancoraggio',
        'Verticalità e allineamento montanti',
        'Serraggio tasselli/bulloni di fissaggio',
        'Presenza paracolpi e protezioni',
        'Integrità gancetti di sicurezza correnti',
        'Assenza corrosione',
        'Assenza deformazioni',
        'Portata leggibile',
        'Corretta distribuzione carichi',
        'Assenza sovraccarichi',
        'Assenza materiali sporgenti',
        'Assenza rischio caduta materiali'
      ]
    },
    arredi: {
      titolo: 'Checklist Arredi tecnici',
      norma: 'D.Lgs. 81/2008 — Art. 63, Allegato IV (punto 1.1)',
      voci: [
        'Stabilità',
        'Assenza ribaltamento',
        'Fissaggi adeguati',
        'Integrità struttura',
        'Assenza danneggiamenti'
      ]
    },
    ambienti: {
      titolo: 'Checklist Ambienti di lavoro',
      norma: 'D.Lgs. 81/2008 — Art. 63, 64, Allegato IV',
      voci: [
        'Vie di esodo libere',
        'Uscite emergenza accessibili',
        'Illuminazione funzionante',
        'Illuminazione emergenza funzionante',
        'Estintori accessibili',
        'Assenza ostacoli',
        'Pavimentazione integra',
        'Controsoffitti integri',
        'Impianto elettrico sicuro',
        'Nessun deposito improprio'
      ]
    }
  };

  // Determina quale checklist usare in base alla categoria del bene / contesto
  function checklistPerCategoria(categoria) {
    if (categoria === 'Scaffalatura metallica' || categoria === 'Rack informatico') return 'scaffalature';
    return 'arredi';
  }

  // -------- Testi normativi consultabili --------
  const NORMATIVA = [
    {
      art: 'Art. 15', titolo: 'Misure generali di tutela',
      testo: 'Le misure generali di tutela della salute e della sicurezza dei lavoratori nei luoghi di lavoro comprendono: la valutazione di tutti i rischi; la programmazione della prevenzione; l\'eliminazione dei rischi o, ove non possibile, la loro riduzione al minimo; il rispetto dei principi ergonomici; la regolare manutenzione di ambienti, attrezzature e impianti. Costituisce riferimento cardine per il censimento e la verifica periodica di scaffalature e arredi.'
    },
    {
      art: 'Art. 17', titolo: 'Obblighi non delegabili del datore di lavoro',
      testo: 'Il datore di lavoro non può delegare la valutazione di tutti i rischi con la conseguente elaborazione del documento di valutazione dei rischi (DVR) e la designazione del responsabile del servizio di prevenzione e protezione. La verifica delle strutture di deposito e archiviazione rientra nel processo di valutazione dei rischi.'
    },
    {
      art: 'Art. 18', titolo: 'Obblighi del datore di lavoro e del dirigente',
      testo: 'Il datore di lavoro e i dirigenti devono, tra l\'altro: fornire ai lavoratori attrezzature idonee; richiedere l\'osservanza delle norme; adottare misure per il controllo delle situazioni di rischio; garantire la manutenzione di ambienti, attrezzature e impianti. Include l\'obbligo di mantenere in efficienza scaffalature e arredi tecnici.'
    },
    {
      art: 'Art. 28', titolo: 'Oggetto della valutazione dei rischi',
      testo: 'La valutazione deve riguardare tutti i rischi per la sicurezza e la salute dei lavoratori, ivi compresi quelli collegati all\'uso di attrezzature. La stabilità di scaffalature e arredi, il rischio di caduta materiali e di ribaltamento sono oggetto obbligatorio di valutazione e del relativo DVR.'
    },
    {
      art: 'Art. 29', titolo: 'Modalità di effettuazione della valutazione dei rischi',
      testo: 'Il datore di lavoro effettua la valutazione ed elabora il documento in collaborazione con il RSPP e il medico competente. La valutazione va rielaborata in occasione di modifiche significative o a seguito di infortuni. Le verifiche periodiche documentate costituiscono evidenza dell\'aggiornamento del DVR.'
    },
    {
      art: 'Art. 63', titolo: 'Requisiti di salute e sicurezza (luoghi di lavoro)',
      testo: 'I luoghi di lavoro devono essere conformi ai requisiti indicati nell\'Allegato IV. Devono possedere requisiti di stabilità e solidità, adeguate vie di circolazione, pavimenti e passaggi liberi da ostacoli. Riferimento diretto per la verifica di ambienti e strutture.'
    },
    {
      art: 'Art. 64', titolo: 'Obblighi del datore di lavoro (luoghi di lavoro)',
      testo: 'Il datore di lavoro provvede affinché i luoghi di lavoro, gli impianti e i dispositivi siano sottoposti a regolare manutenzione tecnica e siano puliti; le vie di circolazione e le uscite di emergenza siano sgombere. Fondamento dell\'obbligo di manutenzione e controllo periodico.'
    },
    {
      art: 'Allegato IV', titolo: 'Requisiti dei luoghi di lavoro',
      testo: 'Definisce i requisiti di stabilità e solidità (punto 1.1), l\'altezza, cubatura e superficie, i pavimenti, muri, soffitti (1.3), le vie di circolazione, zone di pericolo (1.4), le vie e uscite di emergenza (1.5), la difesa contro incendi. Le scaffalature e i depositi non devono compromettere la sicurezza dei luoghi. Riferimento tecnico principale delle checklist.'
    },
    {
      art: 'UNI EN 15635', titolo: 'Uso e manutenzione delle attrezzature di stoccaggio',
      testo: 'Norma tecnica di riferimento (richiamata dall\'art. 18 e dall\'Allegato IV del D.Lgs. 81/2008) per l\'uso e la manutenzione delle scaffalature metalliche. Prevede quattro livelli di controllo: controllo visivo quotidiano, ispezione sistematica interna, ispezione approfondita da tecnico qualificato (cadenza non superiore a 12 mesi) e ispezione straordinaria (dopo urti, sismi o modifiche). Introduce la figura del PRSES (Persona Responsabile della Sicurezza delle attrezzature di Stoccaggio) e la classificazione dei danni a semaforo: Verde (idoneo, monitoraggio), Giallo (intervento entro 30 giorni), Rosso (messa fuori servizio immediata). Il verbale deve contenere osservazioni, classificazione dei danni, rilievo fotografico e piano d\'azione.'
    }
  ];

  global.DATA = {
    TIPOLOGIE_AMBIENTE, CATEGORIE_BENE, ESITI, CLASSI_DANNO, TIPI_ISPEZIONE,
    LIVELLI_RISCHIO, STATI_NC, STATI_BENE, MISURE_IMMEDIATE, TIPI_ALLEGATO,
    RUOLI_FIGURE, RUOLO_NORMA, CHECKLIST, NORMATIVA, checklistPerCategoria,
    CATEGORIE_APPALTO, TIPI_INTERVENTO, PROCEDURE_APPALTO, ATTI_PA,
    STATI_INTERVENTO, SOGLIE_APPALTO, proceduraDaImporto,
    SOTTOTIPI_SCAFFALATURA, ambitoPRSES, CHECKLIST_PRSES, azioniPrescritte,
    CARTELLO_PORTATA, FREQUENZE_ISPEZIONE, frequenzaConsigliata, valutazioneAnte2009
  };
})(window);
