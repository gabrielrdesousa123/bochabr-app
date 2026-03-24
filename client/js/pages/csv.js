// client/js/pages/csv.js

import { db } from '../firebase-config.js';
import { collection, getDocs, addDoc, query, where, deleteDoc, doc, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { canViewPage } from '../permissions.js';

export async function renderCsvHub(root) {
  if (!canViewPage('csv')) {
      root.innerHTML = `<div style="padding:40px; text-align:center;"><h3>Acesso Negado</h3><p>Seu usuário não possui privilégios para gerar Exportações CSV.</p></div>`;
      return;
  }

  root.innerHTML = `
    <h1 tabindex="-1">CSV • Importar / Exportar</h1>
    <div class="toolbar" role="tablist" aria-label="CSV Importar/Exportar" style="gap:8px; flex-wrap:wrap">
      <button class="btn" role="tab" aria-selected="true" id="tab-ref" aria-controls="panel-ref">Árbitros</button>
      <button class="btn" role="tab" aria-selected="false" id="tab-ath" aria-controls="panel-ath">Atletas e Equipes</button>
      <button class="btn" role="tab" aria-selected="false" id="tab-clu" aria-controls="panel-clu">Clubes</button>
      <div style="flex:1"></div>
      <a class="btn" href="#/csv">Voltar</a>
    </div>

    <section id="panel-ref" role="tabpanel" aria-labelledby="tab-ref"></section>
    <section id="panel-ath" role="tabpanel" aria-labelledby="tab-ath" hidden></section>
    <section id="panel-clu" role="tabpanel" aria-labelledby="tab-clu" hidden></section>
  `;

  const tabs = [
    { btn: root.querySelector('#tab-ref'), panel: root.querySelector('#panel-ref'), setup: setupReferees },
    { btn: root.querySelector('#tab-ath'), panel: root.querySelector('#panel-ath'), setup: setupAthletes },
    { btn: root.querySelector('#tab-clu'), panel: root.querySelector('#panel-clu'), setup: setupClubs },
  ];
  
  tabs.forEach((t, i) => {
    t.btn.addEventListener('click', () => {
      tabs.forEach((x, j) => {
        const sel = i === j;
        x.btn.setAttribute('aria-selected', sel ? 'true' : 'false');
        x.panel.hidden = !sel;
      });
      t.setup(t.panel);
    }, { once: true });
  });

  await setupReferees(root.querySelector('#panel-ref'));
}

/* ==================== Processador CSV Local ==================== */
function downloadCSV(filename, headers, dataArray) {
  let csv = headers.join(",") + "\r\n";
  dataArray.forEach(row => {
      csv += row.map(v => {
          let str = String(v ?? '');
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
      }).join(",") + "\r\n";
  });
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function sanitizeForFirestore(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => value === undefined ? null : value));
}

/* ==================== Árbitros ==================== */
async function setupReferees(panel) {
  panel.innerHTML = `
    <div class="toolbar" style="flex-wrap:wrap; gap:8px">
      <label>UF
        <select id="ref-uf" style="min-width:120px">
          <option value="">(todas)</option>
          ${ufs().map(uf => `<option value="${uf}">${uf}</option>`).join('')}
        </select>
      </label>
      <label>Nível
        <select id="ref-nivel" style="min-width:160px">
          <option value="">(todos)</option>
          ${niveis().map(n => `<option value="${n}">${n}</option>`).join('')}
        </select>
      </label>
      <input id="ref-q" type="search" placeholder="Buscar nome..." />
      <button class="btn" id="ref-load">Carregar</button>
      <div style="flex:1"></div>
      <button class="btn" id="ref-export" style="background:#16a34a; color:white;">⬇ Exportar BCMS</button>
    </div>
    <div id="ref-report" style="font-size:12px; color:var(--muted,#667); margin:.25rem 0 .5rem"></div>
    <div style="border:1px solid var(--table-border); border-radius:10px; overflow:auto;">
      <table>
        <thead>
          <tr><th><input type="checkbox" id="ref-all"></th><th>Nome</th><th>UF</th><th>ID</th></tr>
        </thead>
        <tbody id="ref-tbody"></tbody>
      </table>
    </div>
  `;
  const tbody = panel.querySelector('#ref-tbody');
  let currentReferees = [];

  panel.querySelector('#ref-load').onclick = async (e) => {
    e.preventDefault();
    tbody.innerHTML = rowLoading(4);
    const uf = panel.querySelector('#ref-uf').value.toLowerCase();
    const nivel = panel.querySelector('#ref-nivel').value.toLowerCase();
    const q = panel.querySelector('#ref-q').value.trim().toLowerCase();
    
    try {
      const snap = await getDocs(collection(db, "referees"));
      let items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (uf) items = items.filter(a => (a.uf || a.estado || '').toLowerCase() === uf);
      if (nivel) items = items.filter(a => (a.nivel || '').toLowerCase() === nivel);
      if (q) items = items.filter(a => (a.nome || a.nome_completo || '').toLowerCase().includes(q));

      currentReferees = items;
      tbody.innerHTML = '';
      
      if(items.length === 0) {
         tbody.innerHTML = `<tr><td colspan="4" style="padding:12px; text-align:center;">Nenhum árbitro encontrado.</td></tr>`;
         return;
      }

      for (const [i, a] of items.entries()) {
        const nome = a.nome ?? a.nome_completo ?? a.nome_abreviado ?? '';
        const tr = document.createElement('tr');
        if (i % 2) tr.style.background = 'var(--row-alt,#f8fbff)';
        tr.innerHTML = `
          <td><input type="checkbox" class="sel" data-id="${a.id}"></td>
          <td>${esc(nome)}</td>
          <td>${esc(a.uf || a.estado || '')}</td>
          <td>${a.id}</td>
        `;
        tbody.appendChild(tr);
      }
      
      panel.querySelector('#ref-all').onchange = e => {
        tbody.querySelectorAll('input.sel').forEach(ch => ch.checked = e.target.checked);
      };
    } catch(e) {
      tbody.innerHTML = `<tr><td colspan="4" style="padding:12px;color:red;">Erro: ${e.message}</td></tr>`;
    }
  };

  panel.querySelector('#ref-export').onclick = (e) => {
    e.preventDefault();
    const ids = Array.from(tbody.querySelectorAll('input.sel')).filter(ch => ch.checked).map(ch => ch.getAttribute('data-id'));
    if(ids.length === 0) return alert("Selecione pelo menos um árbitro.");
    
    const selected = currentReferees.filter(r => ids.includes(r.id));
    const headers = ["ID", "NOME_COMPLETO", "NOME_ABREVIADO", "UF", "NIVEL"];
    const rows = selected.map(r => [
        r.id, r.nome_completo || r.nome || '', r.nome_abreviado || '', r.uf || r.estado || '', r.nivel || ''
    ]);
    
    downloadCSV("BCMS_Referees_Export.csv", headers, rows);
  };

  panel.querySelector('#ref-load').click();
}

/* ==================== Atletas e Equipes ==================== */
async function setupAthletes(panel) {

  function sortAthletesByCriteria(athletesArray) {
      const getNum = (val) => {
          if (val === null || val === undefined || String(val).trim() === '' || String(val).trim() === '-') return 999999;
          const n = Number(val);
          return isNaN(n) ? 999999 : n;
      };

      athletesArray.sort((a, b) => {
          const aC1 = getNum(a.c1), bC1 = getNum(b.c1);
          if (aC1 !== bC1) return aC1 - bC1;

          const aC2 = getNum(a.c2), bC2 = getNum(b.c2);
          if (aC2 !== bC2) return aC2 - bC2;

          const aC3 = getNum(a.c3), bC3 = getNum(b.c3);
          if (aC3 !== bC3) return aC3 - bC3;

          const aC4 = getNum(a.c4), bC4 = getNum(b.c4);
          if (aC4 !== bC4) return aC4 - bC4;

          const aC5 = getNum(a.c5), bC5 = getNum(b.c5);
          if (aC5 !== bC5) return aC5 - bC5;

          return (a.nome || '').localeCompare(b.nome || '');
      });
  }

  async function loadHistoryFromDB() {
      const list = panel.querySelector('#ath-history-list');
      if(!list) return;
      list.innerHTML = '<span style="color:#94a3b8; font-size:13px;">Carregando backdrops...</span>';
      try {
          const qStr = query(collection(db, "csv_backdrops"), orderBy("timestamp", "desc"));
          const snap = await getDocs(qStr);
          if(snap.empty) {
              list.innerHTML = '<span style="color:#94a3b8; font-size:13px; font-style:italic;">Nenhuma exportação salva no sistema.</span>';
              return;
          }

          let histHtml = '';
          const hist = [];
          snap.forEach(d => {
              const h = { id: d.id, ...d.data() };
              hist.push(h);
              histHtml += `
                  <div style="min-width: 250px; background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 8px;">
                      <div style="display:flex; justify-content: space-between; align-items: center;">
                          <strong style="color: #0f172a; font-size:16px; background: #e2e8f0; padding: 2px 8px; border-radius: 4px;">${esc(h.classCode)}</strong>
                          <span style="font-size:11px; color:#64748b; font-weight:bold;">${esc(h.dateStr)}</span>
                      </div>
                      <div style="font-size:13px; color:#475569; font-weight: 500;">
                          👥 ${h.numAthletes} Selecionados
                      </div>
                      <div style="display:flex; gap: 5px; margin-top: auto;">
                          <button class="btn-load-hist" data-id="${h.id}" style="flex:1; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:6px; cursor:pointer; font-weight:bold; color:#334155; font-size:12px; transition:0.2s;">🔄 Carregar Fielmente</button>
                          <button class="btn-del-hist" data-id="${h.id}" style="background:#fef2f2; border:1px solid #fca5a5; border-radius:4px; padding:6px 12px; cursor:pointer; color:#ef4444; font-weight:bold; font-size:12px; transition:0.2s;">❌</button>
                      </div>
                  </div>
              `;
          });
          list.innerHTML = histHtml;

          list.querySelectorAll('.btn-load-hist').forEach(b => {
              b.onclick = async (e) => {
                  e.preventDefault();
                  b.innerText = 'Carregando...';
                  const h = hist.find(x => x.id === b.dataset.id);
                  if(!h) return;
                  
                  panel.querySelector('#ath-class').value = h.classCode || '';
                  panel.querySelector('#ath-reg').value = h.reg || '';
                  panel.querySelector('#ath-clube').value = h.clube || '';
                  panel.querySelector('#ath-crit1').value = h.c1 || '';
                  panel.querySelector('#ath-crit2').value = h.c2 || '';
                  panel.querySelector('#ath-crit3').value = h.c3 || '';
                  panel.querySelector('#ath-crit4').value = h.c4 || '';
                  panel.querySelector('#ath-crit5').value = h.c5 || '';
                  
                  currentAthletes = h.savedAthletes || [];
                  
                  const tbody = panel.querySelector('#ath-tbody');
                  tbody.innerHTML = '';
                  for (const [i, a] of currentAthletes.entries()) {
                      const tr = document.createElement('tr');
                      if (i % 2) tr.style.background = 'var(--row-alt,#f8fbff)';
                      const isChecked = (h.selectedIds || []).includes(a._systemId) ? 'checked' : '';
                      tr.innerHTML = `
                          <td><input type="checkbox" class="sel" data-id="${a._systemId}" ${isChecked} style="transform:scale(1.2);"></td>
                          <td style="font-weight:bold; color:#0f172a;">${a.rank}</td>
                          <td style="font-weight:bold; color:#dc2626;">${a.c1 ?? '—'}</td>
                          <td style="font-weight:bold; color:#2563eb;">${a.c2 ?? '—'}</td>
                          <td style="font-weight:bold; color:#16a34a;">${a.c3 ?? '—'}</td>
                          <td style="font-weight:bold; color:#eab308;">${a.c4 ?? '—'}</td>
                          <td style="font-weight:bold; color:#9333ea;">${a.c5 ?? '—'}</td>
                          <td style="font-weight:bold;">${esc(a.nome || '').toUpperCase()}</td>
                          <td style="color:#475569; font-weight:bold;">${esc(a.clubeDisplay || '')}</td>
                          <td>${esc(a.regiao || '')}</td>
                          <td style="font-size:11px; color:#94a3b8;">${a._systemId}</td>
                      `;
                      tbody.appendChild(tr);
                  }
                  
                  enableAthletesTableSort(panel.querySelector('#ath-table'));
                  panel.querySelector('#ath-all').onchange = e => {
                      tbody.querySelectorAll('input.sel').forEach(ch => ch.checked = e.target.checked);
                  };

                  panel.querySelector('#ath-report').innerHTML = `✅ <strong>Backdrop Carregado!</strong> (Dia ${h.dateStr})`;
                  b.innerText = '🔄 Carregar Fielmente';
              };
          });

          list.querySelectorAll('.btn-del-hist').forEach(b => {
              b.onclick = async (e) => {
                  e.preventDefault();
                  if(confirm('Tem certeza que deseja excluir esta memória do Banco de Dados?')) {
                      await deleteDoc(doc(db, "csv_backdrops", b.dataset.id));
                      loadHistoryFromDB();
                  }
              };
          });

      } catch (err) {
          console.error(err);
          list.innerHTML = '<span style="color:red; font-size:13px;">Erro ao carregar backdrops da nuvem.</span>';
      }
  }

  panel.innerHTML = `
    <div style="background: #fff; padding: 15px; border-radius: 8px; border: 1px solid #cbd5e1; margin-bottom: 15px;">
        <div style="display:flex; gap:10px; margin-bottom: 15px; flex-wrap:wrap;">
            <label style="flex:2;">Nome
                <input id="ath-q" type="text" placeholder="Buscar por Nome..." style="width:100%; padding:6px 10px; border:1px solid #cbd5e1; border-radius:4px; font-size:13px;" />
            </label>
            <label style="flex:1;">Classe
                <select id="ath-class" style="width:100%; padding:6px 10px; border:1px solid #cbd5e1; border-radius:4px; font-weight:bold; color:#0f172a;"></select>
            </label>
            <label style="flex:1;">Região
                <select id="ath-reg" style="width:100%; padding:6px 10px; border:1px solid #cbd5e1; border-radius:4px;"></select>
            </label>
            <label style="flex:2;">Clube
                <select id="ath-clube" style="width:100%; padding:6px 10px; border:1px solid #cbd5e1; border-radius:4px;"></select>
            </label>
        </div>
        
        <div style="display:flex; gap:10px; flex-wrap:wrap; border-top: 1px dashed #e2e8f0; padding-top: 15px;">
            <label style="flex:1;">Critério Rank 1
                <select id="ath-crit1" style="width:100%; padding:6px 10px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px;"></select>
            </label>
            <label style="flex:1;">Critério Rank 2
                <select id="ath-crit2" style="width:100%; padding:6px 10px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px;"></select>
            </label>
            <label style="flex:1;">Critério Rank 3
                <select id="ath-crit3" style="width:100%; padding:6px 10px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px;"></select>
            </label>
            <label style="flex:1;">Critério Rank 4
                <select id="ath-crit4" style="width:100%; padding:6px 10px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px;"></select>
            </label>
            <label style="flex:1;">Critério Rank 5
                <select id="ath-crit5" style="width:100%; padding:6px 10px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px;"></select>
            </label>
        </div>

        <div style="display:flex; gap:10px; margin-top: 15px; justify-content: space-between; align-items:center;">
            <button class="btn" id="btn-open-comp-import" style="background:#2563eb; color:white;">🔄 Puxar Competição do Sistema</button>
            <div style="display:flex; gap:10px;">
                <button class="btn" id="ath-load" style="background:#0f172a; color:white;">Carregar da Nuvem</button>
                <button class="btn" id="ath-export-flow" style="background:#10b981; color:white; padding:10px 20px; font-size:14px;">➡️ Iniciar Exportação</button>
            </div>
        </div>
    </div>

    <dialog id="modal-comp-import" style="border: none; border-radius: 12px; padding: 25px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); width: 500px; max-width: 90vw;">
        <h3 style="margin-top:0; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">🔄 Puxar Competição do Sistema</h3>
        <p style="font-size:13px; color:#64748b;">Selecione a competição que já configurou no sistema (Sorteio gerado). Os atletas serão importados COM os BIBs corretos e suas Siglas.</p>
        
        <label style="font-weight:bold; font-size:12px;">Selecione a Competição:</label>
        <select id="modal-sel-comp" style="width: 100%; padding: 10px; margin-top: 5px; margin-bottom: 15px; border-radius: 6px; border: 1px solid #cbd5e1;"></select>
        
        <label style="font-weight:bold; font-size:12px;">Classes a Exportar:</label>
        <div id="modal-classes-checkboxes" style="background:#f8fafc; padding:10px; border-radius:6px; border:1px solid #cbd5e1; max-height:150px; overflow-y:auto; margin-top:5px; margin-bottom:20px; display:flex; flex-direction:column; gap:5px;">
            <span style="font-size:12px; color:#94a3b8;">Selecione uma competição primeiro...</span>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button id="btn-cancel-comp-import" style="background: transparent; border: 1px solid #94a3b8; padding: 8px 15px; border-radius: 6px; cursor: pointer; font-weight: bold; color: #475569;">Cancelar</button>
            <button id="btn-confirm-comp-import" style="background: #2563eb; color: white; border: none; padding: 8px 15px; border-radius: 6px; cursor: pointer; font-weight: bold;">📥 Importar</button>
        </div>
    </dialog>

    <dialog id="modal-export-preview" style="border: none; border-radius: 12px; padding: 25px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); width: 850px; max-width: 95vw;">
        <h3 style="margin-top:0; border-bottom:1px solid #e2e8f0; padding-bottom:10px; color:#0f172a;">📋 Resumo da Exportação</h3>
        <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Confira a lista de atletas selecionados, a ordem dos BIBs e o critério de rankeamento aplicado.</p>
        
        <div style="max-height: 400px; overflow-y: auto; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                <thead style="background: #f8fafc; position: sticky; top: 0; z-index: 10;">
                    <tr>
                        <th style="padding: 10px; border-bottom: 1px solid #cbd5e1; width:80px; text-align:center;">BIB</th>
                        <th style="padding: 10px; border-bottom: 1px solid #cbd5e1;">Nome Completo</th>
                        <th style="padding: 10px; border-bottom: 1px solid #cbd5e1;">Clube Completo</th>
                        <th style="padding: 10px; border-bottom: 1px solid #cbd5e1; width:100px;">IOC (Sigla)</th>
                        <th style="padding: 10px; border-bottom: 1px solid #cbd5e1; border-left: 1px dashed #cbd5e1;">Critério / Posição</th>
                    </tr>
                </thead>
                <tbody id="export-preview-tbody"></tbody>
            </table>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap;">
            <button id="btn-cancel-export" style="background: transparent; border: 1px solid #94a3b8; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; color: #475569;">Voltar</button>
            <button id="btn-save-db-only" style="background:#0f172a; color:white; border:none; padding:10px 15px; border-radius:6px; cursor:pointer; font-weight:bold; transition:0.2s;">💾 Salvar no Banco (Backdrop)</button>
            <button id="btn-export-csv-only" style="background:#f59e0b; color:white; border:none; padding:10px 15px; border-radius:6px; cursor:pointer; font-weight:bold; transition:0.2s;">⬇️ Apenas Exportar CSV</button>
            <button id="btn-save-export-both" style="background:#16a34a; color:white; border:none; padding:10px 20px; border-radius:6px; cursor:pointer; font-weight:bold; transition:0.2s;">✅ Salvar e Exportar CSV</button>
        </div>
    </dialog>

    <div style="margin: 15px 0; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px;">
      <h3 style="margin:0; font-size:16px; color:#0f172a; margin-bottom:10px;">💾 Backdrop de Exportações Salvas</h3>
      <div id="ath-history-list" style="display:flex; gap:10px; overflow-x:auto; padding-bottom: 5px;"></div>
    </div>

    <div id="ath-report" style="font-size:12px; color:var(--muted,#667); margin:.25rem 0 .5rem"></div>

    <div style="border:1px solid var(--table-border); border-radius:10px; overflow:auto;">
      <table id="ath-table">
        <thead>
          <tr>
            <th><input type="checkbox" id="ath-all"></th>
            <th>#</th><th>C1</th><th>C2</th><th>C3</th><th>C4</th><th>C5</th>
            <th>Nome Completo</th><th>Clube Completo - SIGLA</th><th>Região</th><th>ID do Sistema</th>
          </tr>
        </thead>
        <tbody id="ath-tbody"></tbody>
      </table>
    </div>
  `;

  const [classes, clubes, regions, comps] = await Promise.all([
    apiClasses(), apiClubesAll(), apiRegioes(), apiCompetitionsDropdown()
  ]);

  fillSelect(panel.querySelector('#ath-class'), [{ value: '', label: '— Selecione a Classe —' }, ...classes.map(c => ({ value: c.code, label: c.code }))]);
  fillSelect(panel.querySelector('#ath-reg'), [{ value: '', label: '(todas)' }, ...regions.map(r => ({ value: r, label: r }))]);
  fillSelect(panel.querySelector('#ath-clube'), [{ value: '', label: '(todos)' }, ...clubes.map(c => ({ value: c.id, label: `${c.sigla ? c.sigla + ' — ' : ''}${c.nome || c.name}` }))]);

  const compOpts = [{ value: '', label: '(nenhum)' }, ...comps.map(c => ({ value: c.id, label: c.nome }))];
  fillSelect(panel.querySelector('#ath-crit1'), compOpts);
  fillSelect(panel.querySelector('#ath-crit2'), compOpts);
  fillSelect(panel.querySelector('#ath-crit3'), compOpts);
  fillSelect(panel.querySelector('#ath-crit4'), compOpts);
  fillSelect(panel.querySelector('#ath-crit5'), compOpts);

  loadHistoryFromDB();

  const tbody = panel.querySelector('#ath-tbody');
  let currentAthletes = [];

  const loadAthletesData = async (e) => {
    if(e) e.preventDefault();
    const thead = panel.querySelector('#ath-table thead');
    if (thead) {
        thead.querySelectorAll('th').forEach((th, idx) => {
            if(idx === 0) return; 
            th.removeAttribute('data-sort');
            th.textContent = th.textContent.replace(/ [↑↓]$/, '');
        });
    }

    tbody.innerHTML = rowLoading(11);

    const cls = (panel.querySelector('#ath-class').value || '').toUpperCase().trim();
    if (!cls) { alert('Escolha uma Classe primeiro.'); tbody.innerHTML = ''; return; }

    const reg = panel.querySelector('#ath-reg').value;
    const clubeIdStr = panel.querySelector('#ath-clube').value;
    const qName = panel.querySelector('#ath-q').value.trim().toLowerCase();
    
    const c1Val = panel.querySelector('#ath-crit1').value;
    const c2Val = panel.querySelector('#ath-crit2').value;
    const c3Val = panel.querySelector('#ath-crit3').value;
    const c4Val = panel.querySelector('#ath-crit4').value;
    const c5Val = panel.querySelector('#ath-crit5').value;

    try {
      const qH = query(collection(db, "historical_results"));
      const snapH = await getDocs(qH);
      const histMap = new Map(); 
      
      snapH.forEach(d => {
        const dt = d.data();
        histMap.set(`${String(dt.athlete_id)}_${String(dt.competition_id)}`, Number(dt.posicao || dt.rank || 9999));
      });

      let items = [];
      const isTeamEvent = cls.includes('PAR') || cls.includes('PAIR') || cls.includes('EQUIP') || cls.includes('TEAM');

      if (isTeamEvent) {
          const snap = await getDocs(collection(db, "equipes"));
          snap.docs.forEach(doc => {
              const data = doc.data();
              if (!data.nome && !data.name) return;
              if (String(data.nome || data.name).trim() === '') return;

              const cat = String(data.category || '').toUpperCase();
              let isMatch = false;
              if (cat === 'TEAM_BC1_BC2' && (cls.includes('BC1') || cls.includes('BC2'))) isMatch = true;
              if (cat === 'PAIR_BC3' && cls.includes('BC3')) isMatch = true;
              if (cat === 'PAIR_BC4' && cls.includes('BC4')) isMatch = true;

              if (isMatch) {
                  let sigla = String(data.club_sigla || data.sigla || '').trim();
                  let repFull = String(data.rep_value_name || data.clube_nome || data.clube || data.club_sigla || data.sigla || 'Sem Clube').trim();
                  
                  if (data.rep_type === 'REGIAO' || data.rep_type === 'ESTADO') {
                      repFull = `Seleção ${data.rep_value}`;
                      sigla = data.rep_value; 
                  }

                  let clubeDisplay = repFull;
                  if (repFull && sigla && !repFull.toUpperCase().includes(sigla.toUpperCase()) && repFull.toUpperCase() !== sigla.toUpperCase()) {
                      clubeDisplay = `${repFull} - ${sigla}`;
                  } else if (!repFull && sigla) {
                      clubeDisplay = sigla;
                  }

                  const oldId = data.id !== undefined ? String(data.id) : doc.id;
                  const c1 = c1Val ? (histMap.get(`${oldId}_${c1Val}`) ?? histMap.get(`${doc.id}_${c1Val}`)) : null;
                  const c2 = c2Val ? (histMap.get(`${oldId}_${c2Val}`) ?? histMap.get(`${doc.id}_${c2Val}`)) : null;
                  const c3 = c3Val ? (histMap.get(`${oldId}_${c3Val}`) ?? histMap.get(`${doc.id}_${c3Val}`)) : null;
                  const c4 = c4Val ? (histMap.get(`${oldId}_${c4Val}`) ?? histMap.get(`${doc.id}_${c4Val}`)) : null;
                  const c5 = c5Val ? (histMap.get(`${oldId}_${c5Val}`) ?? histMap.get(`${doc.id}_${c5Val}`)) : null;

                  items.push({
                      _systemId: doc.id,
                      ...data,
                      nome: data.nome || data.name,
                      clube_nome: repFull,
                      clube_sigla: sigla,
                      clubeDisplay: clubeDisplay, 
                      regiao: (data.rep_type === 'REGIAO' || data.rep_type === 'ESTADO') ? data.rep_value : (data.regiao || ''),
                      genero: 'MF',
                      classe_code: data.category === 'TEAM_BC1_BC2' ? 'Equipe BC1/BC2' : (data.category === 'PAIR_BC3' ? 'Par BC3' : 'Par BC4'),
                      c1: c1, c2: c2, c3: c3, c4: c4, c5: c5
                  });
              }
          });
      } else {
          const clubesSnap = await getDocs(collection(db, "clubes"));
          const clubesMap = {};
          clubesSnap.forEach(d => { clubesMap[d.id] = d.data(); });

          const allAthletesSnap = await getDocs(collection(db, "atletas"));
          
          allAthletesSnap.docs.forEach(doc => {
              const data = doc.data();
              const athClass = String(data.classe_code || '').toUpperCase().trim();

              if (athClass.includes(cls) || cls.includes(athClass)) {
                  const cid = String(data.clube_id || data.club_id || data.id_clube || '').trim();
                  const cnome = String(data.clube_nome || data.clube || data.club || data['representação/clube'] || data.representacao || '').trim();
                  const csigla = String(data.clube_sigla || data.sigla || '').trim();

                  let c = null;
                  if (cid && cid !== 'undefined' && cid !== 'null') c = clubes.find(x => String(x.id) === cid);
                  if (!c && csigla) c = clubes.find(x => String(x.sigla || '').trim().toUpperCase() === csigla.toUpperCase());
                  if (!c && cnome) c = clubes.find(x => String(x.nome || x.name || '').trim().toUpperCase() === cnome.toUpperCase() || String(x.sigla || '').trim().toUpperCase() === cnome.toUpperCase());
                  
                  c = c || {}; 

                  const finalNomeClube = String(c.nome || c.name || cnome).trim();
                  const finalSiglaClube = String(c.sigla || csigla).trim();
                  
                  let clubeDisplay = finalNomeClube;
                  if (finalNomeClube && finalSiglaClube) {
                      if (!finalNomeClube.toUpperCase().includes(finalSiglaClube.toUpperCase()) && finalNomeClube.toUpperCase() !== finalSiglaClube.toUpperCase()) {
                          clubeDisplay = `${finalNomeClube} - ${finalSiglaClube}`;
                      }
                  } else if (!finalNomeClube && finalSiglaClube) {
                      clubeDisplay = finalSiglaClube;
                  } else if (!finalNomeClube && !finalSiglaClube) {
                      clubeDisplay = 'Sem Clube';
                  }

                  const oldId = data.id !== undefined ? String(data.id) : doc.id;
                  const c1 = c1Val ? (histMap.get(`${oldId}_${c1Val}`) ?? histMap.get(`${doc.id}_${c1Val}`)) : null;
                  const c2 = c2Val ? (histMap.get(`${oldId}_${c2Val}`) ?? histMap.get(`${doc.id}_${c2Val}`)) : null;
                  const c3 = c3Val ? (histMap.get(`${oldId}_${c3Val}`) ?? histMap.get(`${doc.id}_${c3Val}`)) : null;
                  const c4 = c4Val ? (histMap.get(`${oldId}_${c4Val}`) ?? histMap.get(`${doc.id}_${c4Val}`)) : null;
                  const c5 = c5Val ? (histMap.get(`${oldId}_${c5Val}`) ?? histMap.get(`${doc.id}_${c5Val}`)) : null;
                  
                  items.push({ 
                      _systemId: doc.id, 
                      ...data, 
                      clube_id: c.id || cid, 
                      clube_nome: finalNomeClube,
                      clube_sigla: finalSiglaClube, 
                      clubeDisplay: clubeDisplay,
                      regiao: c.regiao || data.regiao || '',
                      c1: c1, c2: c2, c3: c3, c4: c4, c5: c5
                  });
              }
          });
      }

      if (reg) items = items.filter(x => (x.regiao || '') === reg);
      if (clubeIdStr) items = items.filter(x => String(x.clube_id) === String(clubeIdStr));
      if (qName) items = items.filter(x => String(x.nome || '').toLowerCase().includes(qName));

      if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="padding:20px; text-align:center;">Nenhum participante encontrado para os filtros.</td></tr>`;
        return;
      }

      sortAthletesByCriteria(items);
      items = items.map((it, idx) => ({ ...it, rank: idx + 1 }));
      currentAthletes = items;

      tbody.innerHTML = '';
      
      for (const [i, a] of items.entries()) {
        const tr = document.createElement('tr');
        if (i % 2) tr.style.background = 'var(--row-alt,#f8fbff)';
        
        tr.innerHTML = `
          <td><input type="checkbox" class="sel" data-id="${a._systemId}" style="transform:scale(1.2);"></td>
          <td style="font-weight:bold; color:#0f172a;">${a.rank}</td>
          <td style="font-weight:bold; color:#dc2626;">${a.c1 ?? '—'}</td>
          <td style="font-weight:bold; color:#2563eb;">${a.c2 ?? '—'}</td>
          <td style="font-weight:bold; color:#16a34a;">${a.c3 ?? '—'}</td>
          <td style="font-weight:bold; color:#eab308;">${a.c4 ?? '—'}</td>
          <td style="font-weight:bold; color:#9333ea;">${a.c5 ?? '—'}</td>
          <td style="font-weight:bold;">${esc(a.nome || '').toUpperCase()}</td>
          <td style="color:#475569; font-weight:bold;">${esc(a.clubeDisplay)}</td>
          <td>${esc(a.regiao || '')}</td>
          <td style="font-size:11px; color:#94a3b8;">${a._systemId}</td>
        `;
        tbody.appendChild(tr);
      }

      enableAthletesTableSort(panel.querySelector('#ath-table'));
      
      panel.querySelector('#ath-all').checked = false;
      panel.querySelector('#ath-all').onchange = e => {
        tbody.querySelectorAll('input.sel').forEach(ch => ch.checked = e.target.checked);
      };
    } catch (err) {
      console.error('[athletes] preview falhou:', err);
      tbody.innerHTML = `<tr><td colspan="11" style="padding:12px;color:#b00">Erro ao cruzar dados do Ranking.</td></tr>`;
    }
  };

  panel.querySelector('#ath-load').onclick = loadAthletesData;

  function getBestCriterion(a) {
      const isValid = (v) => v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '—';
      if (isValid(a.c1)) return `<span style="color:#dc2626; font-weight:bold;">Critério 1 (${a.c1}º)</span>`;
      if (isValid(a.c2)) return `<span style="color:#2563eb; font-weight:bold;">Critério 2 (${a.c2}º)</span>`;
      if (isValid(a.c3)) return `<span style="color:#16a34a; font-weight:bold;">Critério 3 (${a.c3}º)</span>`;
      if (isValid(a.c4)) return `<span style="color:#eab308; font-weight:bold;">Critério 4 (${a.c4}º)</span>`;
      if (isValid(a.c5)) return `<span style="color:#9333ea; font-weight:bold;">Critério 5 (${a.c5}º)</span>`;
      return `<span style="color:#64748b; font-style:italic;">Ordem Alfabética</span>`;
  }

  let currentExportPayload = null; 

  panel.querySelector('#ath-export-flow').onclick = async (e) => {
    e.preventDefault(); 
    
    const checkboxes = Array.from(panel.querySelectorAll('#ath-tbody input.sel:checked'));
    if (!checkboxes.length) { alert('Selecione pelo menos um participante na lista.'); return; }

    const cls = panel.querySelector('#ath-class').value;
    const isTeamEvent = cls.includes('PAR') || cls.includes('PAIR') || cls.includes('EQUIP') || cls.includes('TEAM');
    
    const selectedClassObj = classes.find(c => c.code === cls);
    const bibBase = selectedClassObj ? selectedClassObj.bib_base : '';
    
    const headers = [
        "side_bib", "side_memebeship_id", "ranking", "side_name", "side_ioc",
        "organization_code", "event", "organization_email", "athlete_membership_id",
        "athlete_bib", "first_name", "last_name", "gender", "athlete_ioc",
        "is_cp", "assistant", "class", "category_code"
    ];
    
    const selectedIds = checkboxes.map(ch => ch.getAttribute('data-id'));
    let selectedAthletes = currentAthletes.filter(x => selectedIds.includes(x._systemId));

    const tbodyTrs = Array.from(panel.querySelectorAll('#ath-tbody tr'));
    const idToVisualRank = {};
    tbodyTrs.forEach((tr, visualIndex) => {
        const checkbox = tr.querySelector('input.sel');
        if(checkbox && checkbox.checked) {
            idToVisualRank[checkbox.dataset.id] = visualIndex + 1;
        }
    });

    selectedAthletes.sort((a, b) => {
        const rankA = idToVisualRank[a._systemId] || 9999;
        const rankB = idToVisualRank[b._systemId] || 9999;
        return rankA - rankB;
    });

    let previewRowsHtml = '';
    
    const rowsData = selectedAthletes.map((a, index) => {
        const finalRank = index + 1; 
        const rankStr = String(finalRank).padStart(2, '0');
        
        let genderFull = "MIXED";
        const g = String(a.genero || a.sexo || '').toUpperCase();
        if (g === 'F' || g.startsWith('FEM') || cls.endsWith('F')) genderFull = 'FEMALE';
        else if (g === 'M' || g.startsWith('MAS') || cls.endsWith('M')) genderFull = 'MALE';

        let generatedBib = "";
        const m = cls.match(/BC(\d)/i);
        const classDigit = m ? m[1] : '9'; 

        if (bibBase) {
             const strBase = String(bibBase).trim();
             if (strBase.length >= 3) {
                 const prefix = strBase.slice(0, -2); 
                 generatedBib = `${prefix}${rankStr}`; 
             } else {
                 generatedBib = `${strBase}${rankStr}`; 
             }
        } else {
            if (isTeamEvent) {
                generatedBib = `${classDigit}${rankStr}`;
            } else {
                const genderDigit = genderFull === 'FEMALE' ? '1' : (genderFull === 'MALE' ? '2' : '9');
                generatedBib = `${genderDigit}${classDigit}${rankStr}`;
            }
        }
        
        if (a._importedBib) generatedBib = a._importedBib;

        let fName = '';
        let lName = '';
        let sideName = String(a.nome || a.name || '').trim().toUpperCase();

        if (!isTeamEvent) {
            let parts = sideName.split(' ');
            if (parts.length > 1) {
                const suffixes = ['JUNIOR', 'JÚNIOR', 'NETO', 'FILHO', 'SEGUNDO', 'TERCEIRO', 'SOBRINHO'];
                const connectors = ['DE', 'DA', 'DO', 'DAS', 'DOS'];
                
                let takeCount = 1;
                let lastWord = parts[parts.length - 1].toUpperCase();
                
                if (suffixes.includes(lastWord) && parts.length > 2) {
                    takeCount = 2;
                }
                
                let wordBeforeLastBlock = parts[parts.length - 1 - takeCount];
                if (wordBeforeLastBlock && connectors.includes(wordBeforeLastBlock.toUpperCase())) {
                    takeCount++;
                }
                
                lName = parts.slice(-takeCount).join(' ');
                fName = parts.slice(0, parts.length - takeCount).join(' ');
            } else {
                fName = sideName;
                lName = '';
            }
        }

        const sigla = String(a.clube_sigla || a.sigla || a.clube_nome || '').toUpperCase();
        const baseClass = cls.replace(/[^A-Z0-9]/g, '').replace(/M$|F$/i, ''); 

        const critHTML = getBestCriterion(a);
        
        previewRowsHtml += `
            <tr style="border-bottom: 1px solid #e2e8f0; background: ${index % 2 === 0 ? '#fff' : '#f8fafc'};">
                <td style="padding: 10px; font-weight: 900; color: #0f172a; text-align: center; border-right: 1px solid #e2e8f0;">${generatedBib}</td>
                <td style="padding: 10px; font-weight: bold;">${esc(sideName)}</td>
                <td style="padding: 10px; color: #475569;">${esc(a.clubeDisplay)}</td>
                <td style="padding: 10px; font-weight: bold; color: #2563eb;">${esc(sigla)}</td>
                <td style="padding: 10px; border-left: 1px dashed #cbd5e1;">${critHTML}</td>
            </tr>
        `;

        if (isTeamEvent) {
            return [
                generatedBib, a._systemId, rankStr, sideName, sigla, sigla, "", "", "", "", "", "", "MIXED", sigla, "", "", baseClass, cls                   
            ];
        } else {
            // 🔥 INJEÇÃO CORRETA DO CALHEIRO (assistant) NA EXPORTAÇÃO CSV 🔥
            return [
                generatedBib, a._systemId, rankStr, sideName, sigla, sigla, "", "", a._systemId, generatedBib, fName, lName, genderFull, sigla, "", String(a.operador_rampa ?? "").toUpperCase(), baseClass, cls                   
            ];
        }
    });

    const snapshotAthletes = currentAthletes.map(a => ({
        _systemId: a._systemId,
        rank: a.rank,
        c1: a.c1, c2: a.c2, c3: a.c3, c4: a.c4, c5: a.c5,
        nome: a.nome, name: a.name,
        clube_sigla: a.clube_sigla, clube_nome: a.clube_nome,
        clubeDisplay: a.clubeDisplay, 
        regiao: a.regiao, genero: a.genero, sexo: a.sexo,
        operador_rampa: a.operador_rampa,
        classe_code: a.classe_code
    }));

    const histItem = {
        dateStr: new Date().toLocaleString('pt-BR').slice(0, 16),
        timestamp: Date.now(),
        classCode: cls,
        c1: panel.querySelector('#ath-crit1').value,
        c2: panel.querySelector('#ath-crit2').value,
        c3: panel.querySelector('#ath-crit3').value,
        c4: panel.querySelector('#ath-crit4').value,
        c5: panel.querySelector('#ath-crit5').value,
        reg: panel.querySelector('#ath-reg').value,
        clube: panel.querySelector('#ath-clube').value,
        numAthletes: selectedAthletes.length, 
        selectedIds: selectedIds,
        savedAthletes: snapshotAthletes 
    };

    currentExportPayload = {
        histItem: sanitizeForFirestore(histItem),
        filename: `BCMS_Inscricoes_${cls}.csv`,
        headers: headers,
        rowsData: rowsData,
        numAthletes: selectedAthletes.length
    };

    document.getElementById('export-preview-tbody').innerHTML = previewRowsHtml;
    document.getElementById('modal-export-preview').showModal();
  };

  document.getElementById('btn-cancel-export').onclick = () => {
      document.getElementById('modal-export-preview').close();
  };

  document.getElementById('btn-save-db-only').onclick = async () => {
      const btn = document.getElementById('btn-save-db-only');
      btn.innerText = "A Salvar..."; btn.disabled = true;
      try {
          await addDoc(collection(db, "csv_backdrops"), currentExportPayload.histItem);
          loadHistoryFromDB();
          const athReport = panel.querySelector('#ath-report');
          athReport.innerHTML = `✅ <strong>Sucesso!</strong> Backdrop gravado na nuvem (${currentExportPayload.numAthletes} participantes). CSV não gerado.`;
          document.getElementById('modal-export-preview').close();
      } catch(e) { alert("Erro ao salvar: " + e.message); }
      finally { btn.innerText = "💾 Salvar no Banco"; btn.disabled = false; }
  };

  document.getElementById('btn-export-csv-only').onclick = () => {
      downloadCSV(currentExportPayload.filename, currentExportPayload.headers, currentExportPayload.rowsData);
      const athReport = panel.querySelector('#ath-report');
      athReport.innerHTML = `✅ <strong>Exportado!</strong> Ficheiro CSV criado. Nenhuma alteração foi salva no banco.`;
      document.getElementById('modal-export-preview').close();
  };

  document.getElementById('btn-save-export-both').onclick = async () => {
      const btn = document.getElementById('btn-save-export-both');
      btn.innerText = "A Processar..."; btn.disabled = true;
      try {
          await addDoc(collection(db, "csv_backdrops"), currentExportPayload.histItem);
          loadHistoryFromDB();
          downloadCSV(currentExportPayload.filename, currentExportPayload.headers, currentExportPayload.rowsData);
          const athReport = panel.querySelector('#ath-report');
          athReport.innerHTML = `✅ <strong>Sucesso Total!</strong> Backdrop gravado e ficheiro CSV transferido com sucesso.`;
          document.getElementById('modal-export-preview').close();
      } catch(e) { alert("Erro ao salvar e exportar: " + e.message); }
      finally { btn.innerText = "✅ Salvar e Exportar CSV"; btn.disabled = false; }
  };

  // 🔥 MODAL: PUXAR DA COMPETIÇÃO
  const btnOpenModalComp = panel.querySelector('#btn-open-comp-import');
  if (btnOpenModalComp) {
      btnOpenModalComp.addEventListener('click', async () => {
          const modal = document.getElementById('modal-comp-import');
          const sel = document.getElementById('modal-sel-comp');
          
          sel.innerHTML = '<option value="">Carregando...</option>';
          document.getElementById('modal-classes-checkboxes').innerHTML = '<span style="font-size:12px; color:#94a3b8;">Selecione uma competição primeiro...</span>';
          modal.showModal();

          try {
              const comps = await apiCompetitionsDropdown(); 
              sel.innerHTML = '<option value="">-- Escolha um Campeonato Base --</option>' + comps.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
          } catch(e) {
              sel.innerHTML = '<option value="">Erro ao carregar competições</option>';
          }
      });
  }

  const selCompModal = document.getElementById('modal-sel-comp');
  if (selCompModal) {
      selCompModal.addEventListener('change', async (e) => {
          const cid = e.target.value;
          const box = document.getElementById('modal-classes-checkboxes');
          if(!cid) { box.innerHTML = '<span style="font-size:12px; color:#94a3b8;">Selecione uma competição primeiro...</span>'; return; }
          
          box.innerHTML = 'Procurando classes configuradas...';
          
          try {
              const qDraws = query(collection(db, "draws"), where("competition_id", "==", cid));
              const snap = await getDocs(qDraws);
              
              if(snap.empty) {
                  box.innerHTML = '<span style="color:#ef4444; font-size:13px; font-weight:bold;">Esta competição ainda não tem nenhum sorteio feito.</span>';
                  return;
              }

              const classesFound = [];
              snap.forEach(d => {
                  const data = d.data();
                  if(data.class_code && !classesFound.includes(data.class_code)) classesFound.push(data.class_code);
              });

              if(classesFound.length === 0) {
                  box.innerHTML = '<span style="color:#ef4444; font-size:13px; font-weight:bold;">Nenhuma classe encontrada.</span>';
                  return;
              }

              box.innerHTML = classesFound.map(c => `
                  <label style="display:flex; align-items:center; gap:8px; cursor:pointer; background:#fff; padding:6px; border-radius:4px; border:1px solid #e2e8f0;">
                      <input type="checkbox" value="${esc(c)}" class="comp-class-chk" checked>
                      <span style="font-weight:bold; color:#0f172a;">${esc(c)}</span>
                  </label>
              `).join('');

          } catch(err) {
              box.innerHTML = '<span style="color:red; font-size:13px;">Erro ao buscar dados.</span>';
          }
      });
  }

  document.getElementById('btn-cancel-comp-import').addEventListener('click', () => {
      document.getElementById('modal-comp-import').close();
  });

  document.getElementById('btn-confirm-comp-import').addEventListener('click', async () => {
      const cid = document.getElementById('modal-sel-comp').value;
      if (!cid) return alert("Selecione um campeonato primeiro.");
      
      const checkboxes = Array.from(document.querySelectorAll('.comp-class-chk:checked'));
      if (checkboxes.length === 0) return alert("Selecione pelo menos uma classe.");

      const selectedClasses = checkboxes.map(c => c.value);
      
      const btnConf = document.getElementById('btn-confirm-comp-import');
      btnConf.disabled = true;
      btnConf.textContent = "A importar...";

      try {
          const qDraws = query(collection(db, "draws"), where("competition_id", "==", cid));
          const snapDraws = await getDocs(qDraws);
          
          const qAthletes = query(collection(db, "competition_athletes"), where("competition_id", "==", cid));
          const snapAthletes = await getDocs(qAthletes);

          let importedDataMap = {}; 
          snapAthletes.forEach(d => {
              const data = d.data();
              if(selectedClasses.includes(data.class_code)) {
                  (data.athletes || []).forEach(a => {
                      importedDataMap[a.firebase_id || a.id] = a;
                  });
              }
          });

          let finalAtletasToTable = [];

          snapDraws.forEach(d => {
              const data = d.data();
              if(!selectedClasses.includes(data.class_code)) return;

              const isTeam = data.class_code.includes('PAR') || data.class_code.includes('EQUIP');

              let playersList = [];
              if (data.seeds) playersList = playersList.concat(data.seeds);
              if (data.groups) {
                  data.groups.forEach(g => {
                      if(g.players) playersList = playersList.concat(g.players);
                  });
              }

              playersList.forEach((p, i) => {
                  if(!p || p.id === 'BYE') return;

                  const fullData = importedDataMap[p.firebase_id || p.id] || p;

                  let clubeNome = fullData.clube_nome || fullData.clube || fullData.clube_sigla || '';
                  if (fullData.rep_type === 'REGIAO' || fullData.rep_type === 'ESTADO') {
                      clubeNome = `Seleção ${fullData.rep_value}`;
                  }

                  let clubeDisplay = clubeNome;
                  if (clubeNome && fullData.clube_sigla && !clubeNome.toUpperCase().includes(fullData.clube_sigla.toUpperCase()) && clubeNome.toUpperCase() !== fullData.clube_sigla.toUpperCase()) {
                      clubeDisplay = `${clubeNome} - ${fullData.clube_sigla}`;
                  }

                  finalAtletasToTable.push({
                      _systemId: p.firebase_id || p.id,
                      _importedBib: p.bib || '', 
                      rank: i + 1,
                      c1: fullData.c1 || null,
                      c2: fullData.c2 || null,
                      c3: fullData.c3 || null,
                      c4: fullData.c4 || null,
                      c5: fullData.c5 || null,
                      nome: fullData.nome || p.name || p.nome,
                      clube_nome: fullData.clube_nome || fullData.clube || fullData.rep_value_name || '', 
                      clube_sigla: fullData.clube_sigla || fullData.sigla || fullData.rep_value || '', 
                      clubeDisplay: clubeDisplay,
                      regiao: fullData.regiao || '',
                      genero: fullData.genero || fullData.sexo || 'MF',
                      classe_code: data.class_code,
                      operador_rampa: fullData.operador_rampa || ''
                  });
              });
          });

          if(finalAtletasToTable.length === 0) {
              alert("Nenhum atleta válido encontrado nos sorteios destas classes.");
          } else {
              sortAthletesByCriteria(finalAtletasToTable);
              finalAtletasToTable.forEach((a, idx) => a.rank = idx + 1);
              currentAthletes = finalAtletasToTable;
              
              if(selectedClasses.length === 1) {
                  panel.querySelector('#ath-class').value = selectedClasses[0];
              }

              tbody.innerHTML = '';
              for (const [i, a] of currentAthletes.entries()) {
                  const tr = document.createElement('tr');
                  if (i % 2) tr.style.background = 'var(--row-alt,#f8fbff)';
                  
                  tr.innerHTML = `
                    <td><input type="checkbox" class="sel" data-id="${a._systemId}" checked style="transform:scale(1.2);"></td>
                    <td style="font-weight:bold; color:#0f172a;">${a.rank}</td>
                    <td style="font-weight:bold; color:#dc2626;">${a.c1 ?? '—'}</td>
                    <td style="font-weight:bold; color:#2563eb;">${a.c2 ?? '—'}</td>
                    <td style="font-weight:bold; color:#16a34a;">${a.c3 ?? '—'}</td>
                    <td style="font-weight:bold; color:#eab308;">${a.c4 ?? '—'}</td>
                    <td style="font-weight:bold; color:#9333ea;">${a.c5 ?? '—'}</td>
                    <td style="font-weight:bold;">${esc(a.nome || '').toUpperCase()}</td>
                    <td style="color:#475569; font-weight:bold;">${esc(a.clubeDisplay || '')}</td>
                    <td>${esc(a.regiao || '')}</td>
                    <td style="font-size:11px; color:#94a3b8;">${a._systemId}</td>
                  `;
                  tbody.appendChild(tr);
              }
              
              enableAthletesTableSort(panel.querySelector('#ath-table'));
              panel.querySelector('#ath-all').checked = true;

              document.getElementById('modal-comp-import').close();
              panel.querySelector('#ath-report').innerHTML = `✅ <strong>Competição Importada e Ordenada!</strong> ${finalAtletasToTable.length} atletas puxados dos sorteios da competição com sucesso.`;
          }

      } catch(err) {
          alert("Erro fatal na importação: " + err.message);
      } finally {
          btnConf.disabled = false;
          btnConf.textContent = "📥 Importar";
      }
  });

}

/* ==================== Clubes ==================== */
async function setupClubs(panel) {
  panel.innerHTML = `
    <div class="toolbar" style="flex-wrap:wrap; gap:8px">
      <label>Região
        <select id="clu-reg" style="min-width:160px"></select>
      </label>
      <input id="clu-q" type="search" placeholder="Buscar nome/sigla..." />
      <button class="btn" id="clu-load">Carregar</button>
      <div style="flex:1"></div>
      <button class="btn" id="clu-export" style="background:#16a34a; color:white;">⬇ Exportar BCMS</button>
    </div>
    <div id="clu-report" style="font-size:12px; color:var(--muted,#667); margin:.25rem 0 .5rem"></div>
    <div style="border:1px solid var(--table-border); border-radius:10px; overflow:auto;">
      <table>
        <thead><tr><th><input type="checkbox" id="clu-all"></th><th>Sigla</th><th>Nome</th><th>Região</th><th>ID</th></tr></thead>
        <tbody id="clu-tbody"></tbody>
      </table>
    </div>
  `;
  const tbody = panel.querySelector('#clu-tbody');
  let currentClubs = [];

  const regions = await apiRegioes();
  fillSelect(panel.querySelector('#clu-reg'), [{ value: '', label: '(todas)' }, ...regions.map(r => ({ value: r, label: r }))]);

  panel.querySelector('#clu-load').onclick = async (e) => {
    e.preventDefault();
    tbody.innerHTML = rowLoading(5);
    const reg = panel.querySelector('#clu-reg').value.toLowerCase();
    const q = panel.querySelector('#clu-q').value.trim().toLowerCase();
    
    try {
      const snap = await getDocs(collection(db, "clubes"));
      let items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (reg) items = items.filter(a => (a.regiao || '').toLowerCase() === reg);
      if (q) items = items.filter(a => (a.nome || '').toLowerCase().includes(q) || (a.sigla || '').toLowerCase().includes(q));

      currentClubs = items;
      tbody.innerHTML = '';
      for (const [i, c] of items.entries()) {
        const tr = document.createElement('tr'); if (i % 2) tr.style.background = 'var(--row-alt,#f8fbff)';
        tr.innerHTML = `
          <td><input type="checkbox" class="sel" data-id="${c.id}"></td>
          <td>${esc(c.sigla || '')}</td>
          <td>${esc(c.nome || c.name || '')}</td>
          <td>${esc(c.regiao || '')}</td>
          <td>${c.id}</td>
        `; tbody.appendChild(tr);
      }
      panel.querySelector('#clu-all').onchange = e => {
        tbody.querySelectorAll('input.sel').forEach(ch => ch.checked = e.target.checked);
      };
    } catch(e) { tbody.innerHTML = `<tr><td colspan="5" style="color:red;">Erro: ${e.message}</td></tr>`; }
  };

  panel.querySelector('#clu-export').onclick = (e) => {
    e.preventDefault();
    const ids = Array.from(panel.querySelectorAll('#clu-tbody input.sel')).filter(ch => ch.checked).map(ch => ch.getAttribute('data-id'));
    if(ids.length === 0) return alert("Selecione pelo menos um clube.");
    
    const selected = currentClubs.filter(r => ids.includes(r.id));
    const headers = ["ID", "SIGLA", "NOME", "REGIAO"];
    const rows = selected.map(r => [r.id, r.sigla || '', r.nome || '', r.regiao || '']);
    
    downloadCSV("BCMS_Clubs_Export.csv", headers, rows);
  };

  panel.querySelector('#clu-load').click();
}

/* ==================== helpers/APIs ==================== */
function esc(s) { return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
function fillSelect(sel, options) { sel.innerHTML = options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join(''); }
function rowLoading(cols) { return `<tr><td colspan="${cols}" style="padding:12px">Carregando da nuvem…</td></tr>`; }
function ufs() { return ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO','EXT']; }
function niveis() { return ['Local','Regional','Nacional','Internacional']; }

async function apiClasses() { 
    const snap = await getDocs(collection(db, "classes"));
    return snap.docs.map(doc => {
        const d = doc.data();
        return { code: d.codigo || d.code || doc.id, name: d.nome || d.name, bib_base: d.bib_base || '' };
    });
}
async function apiClubesAll() { 
    const snap = await getDocs(collection(db, "clubes"));
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
async function apiRegioes() { 
    const clubes = await apiClubesAll();
    return Array.from(new Set(clubes.map(c => c.regiao).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' })); 
}

async function apiCompetitionsDropdown() { 
    try {
        const snap = await getDocs(collection(db, "competitions"));
        let arr = [];
        snap.forEach(doc => {
            const d = doc.data();
            arr.push({
                id: doc.id,
                nome: d.name || d.nome || `Competição ${doc.id}`,
                date: d.data_inicio || d.start_date || d.created_at || ''
            });
        });
        arr.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return arr;
    } catch (e) {
        console.error("Erro na apiCompetitionsDropdown:", e);
        return [];
    }
}

function enableAthletesTableSort(table) {
  if (!table || table.dataset.sortReady) return;
  table.dataset.sortReady = "true";

  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  if (!thead || !tbody) return;

  const numericCols = new Set([1, 2, 3, 4, 5, 6]); 

  function clearSortIndicators() {
    thead.querySelectorAll('th').forEach((th, idx) => {
      if (idx === 0) return; 
      th.removeAttribute('data-sort');
      th.textContent = th.textContent.replace(/ [↑↓]$/, '');
    });
  }

  thead.querySelectorAll('th').forEach((th, idx) => {
    if (idx === 0) return; 

    th.style.cursor = 'pointer';
    th.title = "Clique para ordenar visualmente (A Exportação seguirá o Critério)";

    th.addEventListener('click', () => {
      const current = th.getAttribute('data-sort'); 
      const dir = current === 'asc' ? 'desc' : 'asc';
      
      clearSortIndicators();
      th.setAttribute('data-sort', dir);
      th.textContent += (dir === 'asc' ? ' ↑' : ' ↓');

      const rows = Array.from(tbody.querySelectorAll('tr'));
      
      const getVal = (tr) => {
        const td = tr.children[idx];
        const raw = (td?.textContent || '').trim();
        if (numericCols.has(idx)) {
          if (raw === '—' || raw === '') return Number.POSITIVE_INFINITY; 
          const n = Number(raw);
          return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
        }
        return raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      };

      rows.sort((a, b) => {
        const A = getVal(a);
        const B = getVal(b);
        
        if (A === B) {
          const aHash = Number((a.children[1]?.textContent || '').trim()) || 0;
          const bHash = Number((b.children[1]?.textContent || '').trim()) || 0;
          return dir === 'asc' ? (aHash - bHash) : (bHash - aHash);
        }
        
        if (dir === 'asc') return (A > B) ? 1 : -1;
        return (A < B) ? 1 : -1;
      });

      const frag = document.createDocumentFragment();
      rows.forEach(tr => frag.appendChild(tr));
      tbody.innerHTML = '';
      tbody.appendChild(frag);
    });
  });
}