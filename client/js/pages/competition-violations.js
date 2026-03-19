// client/js/pages/competition-violations.js

import { db } from '../firebase-config.js';
import { collection, getDocs, getDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function renderCompetitionViolations(root, hashData) {
  let competitionId = null;

  if (typeof hashData === 'string' && hashData.includes('?')) {
    const urlParams = new URLSearchParams(hashData.split('?')[1]);
    competitionId = urlParams.get('id');
  } else if (hashData && hashData.competitionId) {
    competitionId = hashData.competitionId;
  } else {
     const match = window.location.hash.match(/id=([a-zA-Z0-9_-]+)/) || window.location.hash.match(/id=(\d+)/);
     if (match) competitionId = match[1];
  }

  if (!competitionId) {
    root.innerHTML = `<div class="alert alert-danger" style="margin:20px; padding:20px;">Erro: ID da competição ausente.</div>`;
    return;
  }

  const state = {
    competitionName: 'Carregando...',
    violationsList: [],
    officialsMap: {},
    searchTerm: '',
    currentTab: 'ALL',
    sortCol: 'date',
    sortAsc: false
  };

  const API = {
    getCompetition: async (id) => {
        try {
            const docRef = doc(db, "competitions", String(id));
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : { name: 'Competição Oficial' };
        } catch(e) { return { name: 'Competição Oficial' }; }
    },
    getClasses: async (id) => {
        try {
            const q = query(collection(db, "competition_classes"), where("competition_id", "==", String(id)));
            const snap = await getDocs(q);
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch(e) { return []; }
    },
    getGroupMatches: async (compId, classCode) => {
        try {
            const q = query(collection(db, "matches_group"), where("competition_id", "==", String(compId)), where("class_code", "==", classCode));
            const snap = await getDocs(q);
            if (!snap.empty) {
                const data = snap.docs[0].data();
                return data.matches || data.data || [];
            }
            return [];
        } catch(e) { return []; }
    },
    getKOMatches: async (compId, classCode) => {
        try {
            const q = query(collection(db, "matches_ko"), where("competition_id", "==", String(compId)), where("class_code", "==", classCode));
            const snap = await getDocs(q);
            if (!snap.empty) {
                const data = snap.docs[0].data();
                return data.matches || data.data || [];
            }
            return [];
        } catch(e) { return []; }
    },
    getOfficials: async (id) => {
        try {
            const q = query(collection(db, "competition_officials"), where("competition_id", "==", String(id)));
            const snap = await getDocs(q);
            if (!snap.empty) {
                return snap.docs[0].data().officials || [];
            }
            return [];
        } catch(e) { return []; }
    }
  };

  function safeParse(data) {
    if (!data) return {};
    if (typeof data === 'object') return data;
    try {
      let parsed = JSON.parse(data);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch(e) { return {}; }
  }

  function escapeHTML(str) {
    if (!str) return '-';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&', '<': '<', '>': '>', '"': '&quot;', "'": '&#39;' }[m]));
  }

  async function loadData() {
    root.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; height: 50vh; flex-direction: column;">
        <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #eab308; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <p style="margin-top: 15px; color: #64748b; font-family: sans-serif;">A compilar registos disciplinares na nuvem...</p>
        <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
      </div>
    `;

    try {
      const compData = await API.getCompetition(competitionId);
      state.competitionName = compData.name || compData.nome || 'Competição Oficial';

      const officials = await API.getOfficials(competitionId);
      officials.forEach(o => { state.officialsMap[o.referee_id || o.id] = o.nome_abreviado || o.nome_completo || o.nome; });

      const classes = await API.getClasses(competitionId);
      let allViolations = [];

      const extractViolations = (match, classCode) => {
          // Ignora BYEs
          if (match.status === 'BYE' || match.status === 'SCHEDULED_WITH_BYE' || match.is_bye === true) return;
          if (String(match.entrant1_name || '').toUpperCase() === 'BYE' ||
              String(match.entrant2_name || '').toUpperCase() === 'BYE' ||
              String(match.entrant_a_name || '').toUpperCase() === 'BYE' ||
              String(match.entrant_b_name || '').toUpperCase() === 'BYE') return;

          const details = safeParse(match.details || match.match_details);
          const p1V = details.p1_violations || [];
          const p2V = details.p2_violations || [];

          const refereeName = (match.referee_id || match.referee_principal_id) &&
              state.officialsMap[match.referee_id || match.referee_principal_id]
              ? state.officialsMap[match.referee_id || match.referee_principal_id]
              : '-';

          const pushV = (fullViolString, side) => {
              const bib = side === 1
                  ? (match.entrant1_bib  || match.entrant_a_bib  || match.p1_bib  || '')
                  : (match.entrant2_bib  || match.entrant_b_bib  || match.p2_bib  || '');

              const name = side === 1
                  ? (match.entrant1_name || match.entrant_a_name || match.p1_name || 'Desconhecido')
                  : (match.entrant2_name || match.entrant_b_name || match.p2_name || 'Desconhecido');

              const club = side === 1
    ? (
        // tenta primeiro nomes completos
        match.entrant1_club_nome  || match.entrant_a_club_nome  ||
        match.p1_club_nome        || match.p1_club              ||
        // só se nada disso existir, cai para siglas
        match.entrant1_club_sigla || match.entrant_a_club_sigla ||
        match.p1_club_sigla       || ''
      )
    : (
        match.entrant2_club_nome  || match.entrant_b_club_nome  ||
        match.p2_club_nome        || match.p2_club              ||
        match.entrant2_club_sigla || match.entrant_b_club_sigla ||
        match.p2_club_sigla       || ''
      );

              let violationText = fullViolString;
              let violationDate = '-';

              if (fullViolString.includes(' | ')) {
                  const parts = fullViolString.split(' | ');
                  violationText = parts[0];
                  violationDate = parts[1];
              }

              let severity = 'RETRACTION';
              if (violationText.includes('Vermelho') || violationText.includes('Desqualificação') ||
                  violationText.includes('Forfeit')  || violationText.includes('WO') ||
                  violationText.includes('16.10')    || violationText.includes('16.11') ||
                  violationText.includes('16.12')) {
                  severity = 'RED';
              } else if (violationText.includes('Amarelo') || violationText.includes('16.8') ||
                         violationText.includes('16.9')) {
                  severity = 'YELLOW';
              }

              let rawDateForSort = '0';
              if (violationDate !== '-') {
                  const [datePart, timePart] = violationDate.split(' ');
                  if (datePart && timePart) {
                      const [d, m, y] = datePart.split('/');
                      rawDateForSort = `${y}${m}${d}${timePart.replace(':', '')}`;
                  }
              }

              const isCallRoom = violationText.trim().startsWith('CC -');
              const responsible = isCallRoom ? 'Câmara de Chamada' : refereeName;

              allViolations.push({
                  classCode,
                  matchNum: match.match_number || 0,
                  rawDate: rawDateForSort,
                  date: violationDate,
                  bib: String(bib || '---').trim(),
                  athlete: String(name || 'Desconhecido'),
                  club: String(club || '-'),
                  violation: violationText,
                  referee: responsible,
                  severity: severity
              });
          };

          p1V.forEach(v => pushV(v, 1));
          p2V.forEach(v => pushV(v, 2));
      };

      for (const cls of classes) {
         const code = cls.class_code || cls.codigo || cls.name || cls.id;

         const groupData = await API.getGroupMatches(competitionId, code);
         groupData.forEach(pool => {
            Object.values(pool.rounds || {}).flat().forEach(m => extractViolations(m, code));
         });

         const koData = await API.getKOMatches(competitionId, code);
         koData.forEach(m => extractViolations(m, code));
      }

      state.violationsList = allViolations;

      buildHTML();
      renderTable();
    } catch (e) {
      console.error(e);
      root.innerHTML = `<div class="alert alert-danger" style="margin:20px; padding:20px;">Erro crítico de ligação: ${e.message}</div>`;
    }
  }

  function handleSort(col) {
      if (state.sortCol === col) {
          state.sortAsc = !state.sortAsc;
      } else {
          state.sortCol = col;
          state.sortAsc = true;
      }
      document.querySelectorAll('.sort-arrow').forEach(el => el.innerHTML = '↕');
      const activeHeader = document.querySelector(`th[data-col="${col}"] .sort-arrow`);
      if (activeHeader) activeHeader.innerHTML = state.sortAsc ? '↑' : '↓';
      renderTable();
  }

  // ─────────────────────────────────────────────
  // RENDER TABLE (violações normais + ball return)
  // ─────────────────────────────────────────────
  function renderTable() {
      // aba especial de devolução de bolas
      if (state.currentTab === 'BALL_RETURN') {
          renderBallReturnTab();
          return;
      }

      // esconde seção de devolução se existir
      const ballSection = document.getElementById('ball-return-section');
      if (ballSection) ballSection.style.display = 'none';
      const mainTable = document.querySelector('.wb-main-table-wrapper');
      if (mainTable) mainTable.style.display = '';

      const tbody = document.getElementById('violations-tbody');
      if (!tbody) return;

      let filtered = state.violationsList;
      if (state.currentTab !== 'ALL') {
          filtered = filtered.filter(v => v.severity === state.currentTab);
      }

      const term = state.searchTerm.toLowerCase();
      if (term) {
          filtered = filtered.filter(v =>
             (v.classCode || '').toLowerCase().includes(term) ||
             (v.athlete   || '').toLowerCase().includes(term) ||
             (v.bib       || '').toLowerCase().includes(term) ||
             (v.violation || '').toLowerCase().includes(term) ||
             (v.date      || '').toLowerCase().includes(term)
          );
      }

      filtered.sort((a, b) => {
          let valA = state.sortCol === 'date' ? a.rawDate : a[state.sortCol];
          let valB = state.sortCol === 'date' ? b.rawDate : b[state.sortCol];
          if (state.sortCol === 'matchNum' || state.sortCol === 'bib') {
              valA = parseInt(valA) || 0;
              valB = parseInt(valB) || 0;
          } else {
              valA = String(valA || '').toLowerCase();
              valB = String(valB || '').toLowerCase();
          }
          if (valA < valB) return state.sortAsc ? -1 : 1;
          if (valA > valB) return state.sortAsc ? 1 : -1;
          return 0;
      });

      const emptyRows = () => Array.from({length: 6}).map(() => `
          <tr style="height:32px;">
              <td style="padding:8px; border-top:1px solid #e2e8f0; text-align:center;"></td>
              <td style="padding:8px; border-top:1px solid #e2e8f0; text-align:center;"></td>
              <td style="padding:8px; border-top:1px solid #e2e8f0; text-align:center;"></td>
              <td style="padding:8px; border-top:1px solid #e2e8f0;"></td>
              <td style="padding:8px; border-top:1px solid #e2e8f0;"></td>
              <td style="padding:8px; border-top:1px solid #e2e8f0;"></td>
          </tr>`).join('');

      if (filtered.length === 0) {
          tbody.innerHTML = `
              <tr>
                <td colspan="6" style="text-align:center; padding:20px; color:#94a3b8;">
                  Nenhuma infração encontrada para este filtro.
                </td>
              </tr>
              ${emptyRows()}`;
          return;
      }

      const rowsHtml = filtered.map(v => {
          const isRed    = v.severity === 'RED';
          const isYellow = v.severity === 'YELLOW';
          const bg = isRed ? 'background:#fef2f2;' : (isYellow ? 'background:#fefce8;' : '');
          return `
              <tr style="${bg} border-bottom:1px solid #e2e8f0; transition:background 0.2s;">
                  <td style="padding:12px; font-weight:bold; color:#475569; text-align:center;">
                      ${escapeHTML(v.classCode)}<br>
                      <span style="font-size:11px; font-weight:normal;">J-${v.matchNum}</span>
                  </td>
                  <td style="padding:12px; font-size:11px; font-weight:bold; color:#64748b; text-align:center;">${escapeHTML(v.date)}</td>
                  <td style="padding:12px; text-align:center;">
                      <div style="background:#fff; border:1px solid #cbd5e1; border-radius:4px; padding:3px 8px;
                                  display:inline-block; font-weight:bold; font-size:12px; color:#0f172a;">
                          ${escapeHTML(v.bib)}
                      </div>
                  </td>
                  <td style="padding:12px;">
                      <div style="font-weight:600; color:#1e293b;">${escapeHTML(v.athlete)}</div>
                      <div style="font-size:11px; color:#64748b; text-transform:uppercase;">${escapeHTML(v.club)}</div>
                  </td>
                  <td style="padding:12px; color:#0f172a; font-size:13px;">${escapeHTML(v.violation)}</td>
                  <td style="padding:12px; color:#475569; font-size:13px; font-style:italic;">${escapeHTML(v.referee)}</td>
              </tr>`;
      }).join('');

      tbody.innerHTML = rowsHtml + emptyRows();
  }

  // ─────────────────────────────────────────────
  // ABA DEVOLUÇÃO DE BOLAS
  // ─────────────────────────────────────────────
  function renderBallReturnTab() {
      const mainTable = document.querySelector('.wb-main-table-wrapper');
      if (mainTable) mainTable.style.display = 'none';

      let ballSection = document.getElementById('ball-return-section');
      if (ballSection) {
          ballSection.style.display = '';
          return; // já foi montada antes, apenas mostra
      }

      // Coleta atletas únicos que tiveram violações
      const athleteMap = {};
      state.violationsList.forEach(v => {
          const key = `${v.bib}__${v.athlete}`;
          if (!athleteMap[key]) {
              athleteMap[key] = { bib: v.bib, athlete: v.athlete, club: v.club, classCode: v.classCode };
          }
      });
      const athletes = Object.values(athleteMap).sort((a,b) => a.athlete.localeCompare(b.athlete));

      const athleteOptionsHtml = athletes.length > 0
          ? athletes.map(a => `
              <div class="ball-athlete-option"
                   data-bib="${escapeHTML(a.bib)}"
                   data-name="${escapeHTML(a.athlete)}"
                   data-club="${escapeHTML(a.club)}"
                   data-class="${escapeHTML(a.classCode)}"
                   style="padding:10px 15px; border-bottom:1px solid #e2e8f0; cursor:pointer;
                          display:flex; align-items:center; gap:12px;">
                  <span style="background:#1e293b; color:#fff; font-size:11px; font-weight:900;
                               padding:3px 8px; border-radius:4px; flex-shrink:0;">#${escapeHTML(a.bib)}</span>
                  <div>
                      <div style="font-weight:bold; font-size:14px; color:#0f172a;">${escapeHTML(a.athlete)}</div>
                      <div style="font-size:11px; color:#64748b; text-transform:uppercase;">
                          ${escapeHTML(a.club)} — ${escapeHTML(a.classCode)}
                      </div>
                  </div>
              </div>`)
          .join('')
          : `<div style="padding:20px; text-align:center; color:#94a3b8;">
                 Nenhum atleta com violações registradas.
             </div>`;

      const container = document.querySelector('.wb-container');
      if (!container) return;

      ballSection = document.createElement('div');
      ballSection.id = 'ball-return-section';
      ballSection.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;
                      margin-bottom:15px; flex-wrap:wrap; gap:10px;">
              <h3 style="margin:0; font-size:18px; color:#0f172a;">⚽ Controle de Devolução de Bolas</h3>
              <div style="display:flex; gap:10px;" class="no-print">
                  <button id="btn-add-ball-row"
                          style="background:#0d6efd; color:white; border:none; padding:10px 18px;
                                 border-radius:6px; font-weight:bold; cursor:pointer;
                                 display:flex; align-items:center; gap:8px; font-size:14px;">
                      + Adicionar Atleta
                  </button>
                  <button onclick="window.print()"
                          style="background:#475569; color:white; border:none; padding:10px 18px;
                                 border-radius:6px; font-weight:bold; cursor:pointer; font-size:14px;">
                      🖨️ Imprimir
                  </button>
              </div>
          </div>

          <!-- POPUP -->
          <div id="ball-popup-overlay"
               style="display:none; position:fixed; top:0; left:0; width:100%; height:100%;
                      background:rgba(0,0,0,0.55); z-index:9999;
                      justify-content:center; align-items:center;">
              <div style="background:#fff; border-radius:10px; width:95%; max-width:480px;
                          box-shadow:0 10px 30px rgba(0,0,0,0.3); overflow:hidden;">
                  <div style="background:#0f172a; color:#fff; padding:14px 20px; font-weight:bold;
                              font-size:16px; display:flex; justify-content:space-between; align-items:center;">
                      <span>Selecionar Atleta</span>
                      <button id="ball-popup-close"
                              style="background:none; border:none; color:#fff; font-size:24px;
                                     cursor:pointer; line-height:1;">×</button>
                  </div>
                  <div style="padding:12px 15px; border-bottom:1px solid #e2e8f0;">
                      <input type="text" id="ball-search-input"
                             placeholder="Pesquisar atleta ou BIB..."
                             style="width:100%; padding:8px 12px; border:1px solid #cbd5e1;
                                    border-radius:6px; font-size:14px; box-sizing:border-box;">
                  </div>
                  <div id="ball-athletes-list" style="max-height:320px; overflow-y:auto;">
                      ${athleteOptionsHtml}
                  </div>
              </div>
          </div>

          <!-- TABELA -->
          <div style="overflow-x:auto; background:#fff; border-radius:8px;
                      border:1px solid #e2e8f0; box-shadow:0 1px 3px rgba(0,0,0,0.08);">
              <table style="width:100%; border-collapse:collapse; font-size:13px;" id="ball-return-table">
                  <thead>
                      <tr style="background:#f8fafc; border-bottom:2px solid #cbd5e1;">
                          <th style="padding:12px 15px; text-align:left; font-size:11px; text-transform:uppercase;
                                     color:#475569; font-weight:600; border-right:1px solid #e2e8f0; width:80px;">BIB</th>
                          <th style="padding:12px 15px; text-align:left; font-size:11px; text-transform:uppercase;
                                     color:#475569; font-weight:600; border-right:1px solid #e2e8f0;">Atleta / Delegação</th>
                          <th style="padding:12px 15px; text-align:center; font-size:11px; text-transform:uppercase;
                                     color:#475569; font-weight:600; border-right:1px solid #e2e8f0; width:110px;">Qtd. Bolas</th>
                          <th style="padding:12px 15px; text-align:center; font-size:11px; text-transform:uppercase;
                                     color:#475569; font-weight:600; border-right:1px solid #e2e8f0; width:160px;">Data / Hora</th>
                          <th style="padding:12px 15px; text-align:center; font-size:11px; text-transform:uppercase;
                                     color:#475569; font-weight:600; border-right:1px solid #e2e8f0;">Assinatura</th>
                          <th style="padding:12px 15px; text-align:center; font-size:11px; text-transform:uppercase;
                                     color:#475569; font-weight:600; width:50px;" class="no-print">✕</th>
                      </tr>
                  </thead>
                  <tbody id="ball-return-tbody">
                      <tr id="ball-empty-row">
                          <td colspan="6" style="padding:40px; text-align:center; color:#94a3b8;">
                              Clique em "+ Adicionar Atleta" para registrar uma devolução.
                          </td>
                      </tr>
                  </tbody>
              </table>
          </div>
               `;

      container.appendChild(ballSection);

      // ── eventos ──────────────────────────────
      const overlay  = document.getElementById('ball-popup-overlay');
      const addBtn   = document.getElementById('btn-add-ball-row');
      const closeBtn = document.getElementById('ball-popup-close');
      const searchIn = document.getElementById('ball-search-input');
      const listEl   = document.getElementById('ball-athletes-list');

      addBtn.onclick  = () => { searchIn.value = ''; filterAthletes(''); overlay.style.display = 'flex'; };
      closeBtn.onclick = () => { overlay.style.display = 'none'; };
      overlay.onclick  = (e) => { if (e.target === overlay) overlay.style.display = 'none'; };

      searchIn.oninput = (e) => filterAthletes(e.target.value);

      function filterAthletes(term) {
          const t = term.toLowerCase();
          listEl.querySelectorAll('.ball-athlete-option').forEach(item => {
              item.style.display = item.textContent.toLowerCase().includes(t) ? 'flex' : 'none';
          });
      }

      listEl.addEventListener('click', (e) => {
          const opt = e.target.closest('.ball-athlete-option');
          if (!opt) return;
          overlay.style.display = 'none';
          addBallRow(opt.dataset.bib, opt.dataset.name, opt.dataset.club, opt.dataset.class);
      });

      function addBallRow(bib, name, club, cls) {
          const tbody = document.getElementById('ball-return-tbody');
          const empty = document.getElementById('ball-empty-row');
          if (empty) empty.remove();

          const rowId = `br-${Date.now()}`;
          const tr = document.createElement('tr');
          tr.id = rowId;
          tr.style.borderBottom = '1px solid #e2e8f0';
          tr.innerHTML = `
              <td style="padding:12px 15px; border-right:1px solid #f1f5f9; text-align:center;">
                  <span style="background:#1e293b; color:#fff; font-size:11px; font-weight:900;
                               padding:3px 8px; border-radius:4px;">#${escapeHTML(bib)}</span>
              </td>
              <td style="padding:12px 15px; border-right:1px solid #f1f5f9;">
                  <div style="font-weight:600; color:#1e293b;">${escapeHTML(name)}</div>
                  <div style="font-size:11px; color:#64748b; text-transform:uppercase;">
                      ${escapeHTML(club)} — ${escapeHTML(cls)}
                  </div>
              </td>
              <td style="padding:8px 15px; border-right:1px solid #f1f5f9; text-align:center;">
                  <input type="number" min="1" max="99" placeholder="0"
                         style="width:60px; padding:6px; text-align:center; border:1px solid #cbd5e1;
                                border-radius:4px; font-size:14px; font-weight:bold;">
              </td>
              <td style="padding:8px 15px; border-right:1px solid #f1f5f9; text-align:center;">
                  <span style="display:block; height:28px; border-bottom:1px dashed #cbd5e1;
                               width:90%; margin:0 auto;"></span>
              </td>
              <td style="padding:8px 15px; border-right:1px solid #f1f5f9; text-align:center;">
                  <span style="display:block; height:28px; border-bottom:1px dashed #cbd5e1;
                               width:90%; margin:0 auto;"></span>
              </td>
              <td style="padding:8px 15px; text-align:center;" class="no-print">
                  <button onclick="
                      document.getElementById('${rowId}').remove();
                      const t = document.getElementById('ball-return-tbody');
                      if(t && t.children.length === 0){
                          const r = document.createElement('tr');
                          r.id='ball-empty-row';
                          r.innerHTML='<td colspan=6 style=padding:40px;text-align:center;color:#94a3b8;>Clique em &quot;+ Adicionar Atleta&quot; para registrar uma devolução.</td>';
                          t.appendChild(r);
                      }"
                      style="background:none; border:none; color:#ef4444; cursor:pointer;
                             font-size:20px; font-weight:bold;">×</button>
              </td>
          `;
          tbody.appendChild(tr);
      }
  }

  // ─────────────────────────────────────────────
  // BUILD HTML (estrutura principal)
  // ─────────────────────────────────────────────
  function buildHTML() {
    const styles = `
      <style>
        .wb-container { max-width: 1200px; margin: 0 auto; padding: 20px; font-family: sans-serif; }
        .wb-header { display: flex; justify-content: space-between; align-items: center;
                     border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 20px; }
        .btn-outline-secondary { border: 1px solid #cbd5e1; background: white; color: #475569;
                                  padding: 8px 16px; border-radius: 6px; cursor: pointer;
                                  font-weight: 500; transition: all 0.2s; }
        .btn-outline-secondary:hover { background: #f1f5f9; color: #0f172a; }
        .btn-primary-print { background: #0d6efd; border: 1px solid #0b5ed7; color: white;
                              padding: 8px 16px; border-radius: 6px; cursor: pointer;
                              font-weight: bold; transition: background 0.2s;
                              display: flex; align-items: center; gap: 8px; }
        .btn-primary-print:hover { background: #0b5ed7; }
        .tabs-container { display: flex; gap: 10px; margin-bottom: 15px;
                          border-bottom: 1px solid #cbd5e1; padding-bottom: 10px; overflow-x: auto; }
        .tab-btn { background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px 16px;
                   border-radius: 20px; font-size: 13px; font-weight: 600; color: #64748b;
                   cursor: pointer; transition: all 0.2s; white-space: nowrap; }
        .tab-btn:hover { background: #e2e8f0; color: #0f172a; }
        .tab-btn.active[data-tab="ALL"]         { background: #0f172a; color: white; border-color: #0f172a; }
        .tab-btn.active[data-tab="RETRACTION"]  { background: #3b82f6; color: white; border-color: #2563eb; }
        .tab-btn.active[data-tab="YELLOW"]      { background: #eab308; color: white; border-color: #ca8a04; }
        .tab-btn.active[data-tab="RED"]         { background: #ef4444; color: white; border-color: #dc2626; }
        .tab-btn.active[data-tab="BALL_RETURN"] { background: #10b981; color: white; border-color: #059669; }
        .search-input { width: 100%; padding: 10px 15px; border: 1px solid #cbd5e1;
                        border-radius: 6px; font-size: 14px; outline: none; margin-bottom: 20px; }
        .search-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
        .wb-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px;
                    overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
        .wb-table th { background: #f8fafc; color: #475569; font-weight: 600;
                       text-transform: uppercase; font-size: 11px; padding: 12px; text-align: left;
                       border-bottom: 2px solid #cbd5e1; cursor: pointer; user-select: none; transition: background 0.2s; }
        .wb-table th:hover { background: #e2e8f0; color: #0f172a; }
        .sort-arrow { display: inline-block; margin-left: 5px; color: #94a3b8; font-size: 14px; }
        .ball-athlete-option:hover { background: #f1f5f9 !important; }
        @media print {
          @page { size: A4 landscape; margin: 1.5cm; }
          header, nav, .no-print { display: none !important; }
          body, html { background-color: #fff !important; font-size: 10pt !important; }
          .wb-container { max-width: 100% !important; padding: 0 !important; }
          .wb-table { box-shadow: none !important; border: 1px solid #000 !important; }
          .wb-table th, .wb-table td { border: 1px solid #ccc !important; }
          .wb-table th { background: #eee !important; color: #000 !important; -webkit-print-color-adjust: exact; }
          tr { page-break-inside: avoid; }
         
          #ball-popup-overlay { display: none !important; }
        }
      </style>
    `;

    root.innerHTML = `
      ${styles}
      <div class="wb-container">
        <div class="wb-header">
          <div>
            <h1 style="margin:0; font-size:26px; color:#0f172a;">Painel Disciplinar e Violações</h1>
            <p style="margin:4px 0 0 0; color:#64748b; font-size:14px;">${escapeHTML(state.competitionName)}</p>
          </div>
          <div class="no-print" style="display:flex; gap:10px;">
            <button class="btn-primary-print" onclick="window.print()">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
              </svg>
              Imprimir Relatório
            </button>
            <button class="btn-outline-secondary" onclick="window.history.back()">← Voltar</button>
          </div>
        </div>

        <div class="no-print">
            <div class="tabs-container" id="tabs-container">
                <button class="tab-btn active" data-tab="ALL">Todas as Infrações</button>
                <button class="tab-btn" data-tab="RETRACTION">Retrações / Penaltis</button>
                <button class="tab-btn" data-tab="YELLOW">Cartão Amarelo 🟨</button>
                <button class="tab-btn" data-tab="RED">Cartão Vermelho / W.O 🟥</button>
                <button class="tab-btn" data-tab="BALL_RETURN">⚽ Devolução de Bolas</button>
            </div>
            <input type="text" id="viol-search" class="search-input"
                   placeholder="Pesquisar por classe, atleta, BIB, data ou infração...">
        </div>

        <!-- wrapper da tabela principal de violações -->
        <div class="wb-main-table-wrapper" style="overflow-x:auto;">
          <table class="wb-table">
            <thead>
              <tr>
                <th style="width:90px; text-align:center;" data-col="matchNum" class="sortable-th">
                    Jogo <span class="sort-arrow">↕</span>
                </th>
                <th style="width:100px; text-align:center;" data-col="date" class="sortable-th">
                    Ação Lançada <span class="sort-arrow">↓</span>
                </th>
                <th style="width:70px; text-align:center;" data-col="bib" class="sortable-th">
                    BIB <span class="sort-arrow">↕</span>
                </th>
                <th style="width:25%;" data-col="athlete" class="sortable-th">
                    Atleta / Delegação <span class="sort-arrow">↕</span>
                </th>
                <th data-col="violation" class="sortable-th">
                    Descrição da Violação (Súmula) <span class="sort-arrow">↕</span>
                </th>
                <th style="width:15%;" data-col="referee" class="sortable-th">
                    Responsável <span class="sort-arrow">↕</span>
                </th>
              </tr>
            </thead>
            <tbody id="violations-tbody"></tbody>
          </table>
        </div>
      </div>
    `;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.currentTab = e.target.dataset.tab;
            renderTable();
        });
    });

    document.getElementById('viol-search').addEventListener('input', (e) => {
        state.searchTerm = e.target.value;
        renderTable();
    });

    document.querySelectorAll('.sortable-th').forEach(th => {
        th.addEventListener('click', () => handleSort(th.dataset.col));
    });
  }

  loadData();
}