// client/js/pages/draw-page.js

import { db } from '../firebase-config.js';
import { collection, doc, setDoc, getDocs, query } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
// 🔥 IMPORTAÇÃO DA SUA LISTA OFICIAL DE FORMATOS
import { formatosA1 } from '../data/formatosA1.js';

// === UTILS ===
const qs = (sel) => document.querySelector(sel);
const qsAll = (sel) => document.querySelectorAll(sel);
const escapeHTML = (s = '') => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const showToast = (msg, type = 'info') => {
  const t = qs('#toast') || document.createElement('div');
  t.id = 'toast'; t.className = `toast ${type} show`; t.textContent = msg;
  if (!t.parentNode) document.body.appendChild(t);
  setTimeout(() => t.classList.remove('show'), 3000);
};

export async function renderDrawPage(root, params = {}) {
  let competitionId = params.competitionId;
  let classCode = params.classCode;

  if (!competitionId || !classCode) {
      const hash = window.location.hash;
      const qString = hash.includes('?') ? hash.split('?')[1] : '';
      const urlParams = new URLSearchParams(qString);
      
      if (!competitionId) competitionId = urlParams.get('id') || urlParams.get('comp_id');
      if (!classCode) classCode = urlParams.get('class');

      if (!competitionId || !classCode) {
          for (let i = 0; i < sessionStorage.length; i++) {
              const key = sessionStorage.key(i);
              if (key && key.startsWith('draw_athletes_')) {
                  const parts = key.replace('draw_athletes_', '').split('_');
                  if (parts.length >= 2) {
                      competitionId = parts[0];
                      classCode = parts.slice(1).join('_');
                      break;
                  }
              }
          }
      }
  }

  if (!competitionId || !classCode) {
    root.innerHTML = `<div class="alert alert-danger m-3">Dados inválidos (competição ou classe). Verifique a URL.</div>`;
    return;
  }

  const exactKey = `draw_athletes_${competitionId}_${classCode}`;
  const rawState = sessionStorage.getItem(exactKey);
  if (!rawState) {
    root.innerHTML = `<div class="alert alert-danger m-3">Nenhum atleta/equipe selecionado para sorteio. <button class="btn btn-primary" onclick="history.back()">Voltar</button></div>`;
    return;
  }

  const { athletesForDraw } = JSON.parse(rawState);
  if (!athletesForDraw || athletesForDraw.length === 0) {
    root.innerHTML = `<div class="alert alert-warning m-3">Lista vazia.</div>`;
    return;
  }

  const classCodeUp = classCode.toUpperCase();
  const isTeamEvent = classCodeUp.includes('PAR') || classCodeUp.includes('PAIR') || classCodeUp.includes('EQUIP') || classCodeUp.includes('TEAM');

  const state = {
    compId: competitionId,
    classCode: classCode,
    athletes: athletesForDraw,
    classConfig: null,
    bibBase: null,
    pools: [],
    koDraw: [],
    formatMode: 'GROUP',
  };

  let clubsMap = {};

  try {
    const [classSnap, clubSnap] = await Promise.all([
      getDocs(query(collection(db, "classes"))),
      getDocs(collection(db, "clubes"))
    ]);

    classSnap.forEach(doc => {
      const c = doc.data();
      if (c.codigo === classCode || c.code === classCode) {
         state.classConfig = c;
         state.bibBase = c.bib_base || null;
      }
    });

    clubSnap.forEach(doc => {
      const data = doc.data();
      clubsMap[doc.id] = { logo: data.logo_url || null, nome: data.nome || data.sigla, sigla: data.sigla || '' };
    });

  } catch(e) {
      console.warn("Erro ao buscar configurações ou clubes.", e);
  }

  function generateBib(item, position) {
    if (state.bibBase) {
        const match = String(state.bibBase).match(/^(.*?)(\d+)$/);
        if (match) {
            const prefix = match[1];
            const baseNum = parseInt(match[2], 10);
            const finalNum = baseNum + position;
            const paddedNum = String(finalNum).padStart(match[2].length, '0');
            return `${prefix}${paddedNum}`;
        } else {
            return `${state.bibBase}${String(position).padStart(2, '0')}`;
        }
    }

    const pad2 = n => String(n).padStart(2, '0');
    if (isTeamEvent) {
        if (classCodeUp.includes('BC3')) return `3${pad2(position)}`;
        if (classCodeUp.includes('BC4')) return `4${pad2(position)}`;
        return `1${pad2(position)}`;
    }

    const g = String(item.genero || item.sexo || '').toUpperCase();
    const genderDigit = (g === 'F' || g.startsWith('FEM')) ? '1' : ((g === 'M' || g.startsWith('MAS')) ? '2' : '9');
    const m = String(item.classe_code || classCode || '').toUpperCase().match(/BC(\d)/);
    const classDigit = m ? m[1] : '9';
    return `${genderDigit}${classDigit}${pad2(position)}`;
  }

  state.athletes.sort((a, b) => {
    if ((a.c1 ?? 999) !== (b.c1 ?? 999)) return (a.c1 ?? 999) - (b.c1 ?? 999);
    if ((a.c2 ?? 999) !== (b.c2 ?? 999)) return (a.c2 ?? 999) - (b.c2 ?? 999);
    if ((a.c3 ?? 999) !== (b.c3 ?? 999)) return (a.c3 ?? 999) - (b.c3 ?? 999);
    return a.nome.localeCompare(b.nome);
  });

  state.athletes = state.athletes.map((a, idx) => {
      let logo = null;
      let nomeClube = a.clube_nome || a.clube_sigla;
      let siglaClube = a.sigla || a.clube_sigla;
      let clubeIdReal = a.clube_id || (a.clubes_ids && a.clubes_ids[0]) || a.rep_value;

      if (clubeIdReal && clubsMap[clubeIdReal]) {
          logo = clubsMap[clubeIdReal].logo;
          nomeClube = clubsMap[clubeIdReal].nome;
          siglaClube = clubsMap[clubeIdReal].sigla;
      }

      return {
          ...a,
          bib: generateBib(a, idx + 1),
          originalSeed: idx + 1,
          logo_url: logo,
          clube_nome_completo: nomeClube,
          sigla_final: siglaClube
      };
  });

  const colorBg = state.classConfig?.ui_bg || '#f59e0b';
  const colorFg = state.classConfig?.ui_fg || '#000000';

  root.innerHTML = `
    <div style="padding: 20px; font-family: sans-serif; background: #f4f6f8; min-height: 100vh;">
      
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #1e293b;">Sorteio Oficial: <span style="background: #fbbf24; padding: 4px 10px; border-radius: 6px; color: #000;">${escapeHTML(classCode)}</span></h2>
        <p style="color: #475569; margin-top: 5px;" id="lbl-modo-comp">Modo de Competição: Fase de Grupos (Potes)</p>
      </div>

      <div style="background: white; border-radius: 12px; padding: 25px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); max-width: 1100px; margin: 0 auto;">
        
        <div style="display: flex; justify-content: center; align-items: center; gap: 15px; margin-bottom: 20px;">
           <label style="font-weight: bold; color: #334155; font-size: 15px;">Selecione o Formato da Chave (Anexo A):</label>
           <select id="draw-pools-select" class="form-select form-select-sm" style="width: auto; padding: 10px; border-radius: 6px; font-size: 14px; min-width: 400px;"></select>
        </div>
        <div style="text-align: center; font-size: 12px; color: #64748b; margin-top: -15px; margin-bottom: 25px;">(*) Formato preferencial recomendado pela World Boccia</div>

        <div style="display: flex; justify-content: center; margin-bottom: 35px;">
          <button id="btn-generate" style="background: #3b82f6; color: white; border: none; padding: 12px 25px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 6px rgba(59,130,246,0.3); font-size: 15px;">
            🎲 GERAR SORTEIO POR POTES
          </button>
        </div>

        <div id="draw-results" style="display: flex; flex-wrap: wrap; gap: 25px; justify-content: center;"></div>

        <div style="margin-top: 40px; border-top: 2px solid #e2e8f0; padding-top: 25px; display: flex; justify-content: flex-start;">
          <button id="btn-save-draw" style="background: #16a34a; color: white; border: none; padding: 15px 30px; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer; box-shadow: 0 4px 6px rgba(22,163,74,0.3); transition: 0.2s; display: none;">
            💾 SALVAR SORTEIO E GERAR JOGOS
          </button>
        </div>

      </div>
    </div>

    <dialog id="modal-swap" style="border: none; border-radius: 12px; padding: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); width: 450px;">
      <h3 style="margin-top: 0; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px;">Trocar Atleta/Equipe</h3>
      <p style="font-size: 15px; color: #475569; margin-bottom: 20px;">Você está movendo: <br><strong id="swap-player-name" style="color: #3b82f6; font-size: 18px;"></strong></p>
      
      <label style="font-weight: bold; font-size: 14px; color: #475569; display: block; margin-bottom: 8px;">Selecione quem ele vai substituir:</label>
      <select id="swap-target" style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 25px; font-size: 14px;"></select>

      <div style="display: flex; justify-content: flex-end; gap: 12px;">
        <button id="btn-swap-cancel" style="background: transparent; border: 1px solid #94a3b8; padding: 12px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; color: #475569; font-size: 14px;">Cancelar</button>
        <button id="btn-swap-confirm" style="background: #3b82f6; color: white; border: none; padding: 12px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px;">🔄 Confirmar Troca</button>
      </div>
    </dialog>
  `;

  const numAtletas = state.athletes.length;
  const availableFormats = formatosA1.filter(f => f.entry === numAtletas);
  const sel = qs('#draw-pools-select');
  
  if (availableFormats.length > 0) {
      let optionsHtml = availableFormats.map(f => {
          const isPref = f.preferred ? ' (*)' : '';
          const text = `${f.pools} Grupos | F. Grupos: ${f.poolMatches} jg | Eliminatórias: ${f.koMatches} jg | Total: ${f.totalMatches} jogos`;
          return `<option value="${f.pools}" ${f.preferred ? 'selected' : ''}>${text}${isPref}</option>`;
      }).join('');
      
      optionsHtml += `<option value="0">Eliminatória Direta (Mata-Mata) - Sem Grupos</option>`;
      sel.innerHTML = optionsHtml;
  } else {
      sel.innerHTML = `<option value="1">1 Grupo (Fallback)</option><option value="0">Eliminatória Direta (Mata-Mata) - Sem Grupos</option>`;
  }

  let swapData = null;

  function distributeGroupsPots() {
      const pCount = parseInt(sel.value, 10);
      
      if (pCount === 0) {
          state.formatMode = 'PURE_KNOCKOUT';
          state.koDraw = [...state.athletes];
          state.pools = [];
          qs('#lbl-modo-comp').textContent = "Modo de Competição: Eliminatória Direta (Mata-Mata)";
          renderGroups();
          return;
      }

      state.formatMode = 'GROUP';
      qs('#lbl-modo-comp').textContent = "Modo de Competição: Fase de Grupos (Sorteio por Potes)";
      
      const pools = Array.from({length: pCount}, (_, i) => ({
          name: String.fromCharCode(65 + i),
          players: []
      }));

      let athletesToDraw = [...state.athletes];

      for (let i = 0; i < pCount; i++) {
          if (athletesToDraw.length > 0) {
              pools[i].players.push(athletesToDraw.shift());
          }
      }

      while (athletesToDraw.length > 0) {
          let currentPot = athletesToDraw.splice(0, pCount);
          for (let i = currentPot.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [currentPot[i], currentPot[j]] = [currentPot[j], currentPot[i]];
          }
          for (let i = 0; i < currentPot.length; i++) {
              pools[i].players.push(currentPot[i]);
          }
      }

      pools.forEach(pool => {
          pool.players.sort((a, b) => parseInt(a.bib) - parseInt(b.bib));
      });

      state.pools = pools;
      renderGroups();
  }

  function renderGroups() {
      const container = qs('#draw-results');
      const btnSave = qs('#btn-save-draw');
      
      if (state.formatMode === 'PURE_KNOCKOUT') {
          btnSave.style.display = 'block';
          container.innerHTML = `
             <div style="width: 100%; max-width: 650px; background: white; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.05);">
                <div style="background: ${colorBg}; color: ${colorFg}; padding: 15px; font-weight: bold; text-align: center; font-size: 18px;">
                  Ranqueamento da Chave Eliminatória (Seeds)
                </div>
                <div style="padding: 10px;">
                   ${state.koDraw.map((p, idx) => `
                      <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; border-bottom: 1px solid #f1f5f9;">
                         <div style="display: flex; gap: 15px; align-items: center;">
                            <span style="font-weight:900; color:#cbd5e1; font-size: 20px; width: 30px; text-align:right;">${idx+1}º</span>
                            <span style="background: #eff6ff; color: #2563eb; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 15px;">${p.bib}</span>
                            <div style="display:flex; flex-direction:column;">
                               <span style="font-weight:bold; color:#0f172a; font-size: 16px; line-height: 1.2;">${escapeHTML(p.nome)}</span>
                               <div style="display:flex; align-items:center; gap:6px; margin-top:4px;">
                                   ${p.logo_url ? `<img src="${p.logo_url}" style="height: 18px; max-width: 28px; object-fit: contain; border-radius: 2px; border: 1px solid #e2e8f0; background: white;">` : ''}
                                   <span style="font-size:12px; color:#64748b; font-weight:bold; text-transform:uppercase;">${escapeHTML(p.clube_nome_completo || p.clube_sigla || '-')}</span>
                               </div>
                            </div>
                         </div>
                      </div>
                   `).join('')}
                   <div style="padding: 15px; text-align: center; color: #64748b; font-size: 13px; font-style: italic;">
                     O sistema gerará automaticamente os BYEs necessários para cruzar a chave corretamente.
                   </div>
                </div>
             </div>
          `;
          return;
      }

      if (state.pools.length === 0) {
          container.innerHTML = '';
          btnSave.style.display = 'none';
          return;
      }

      btnSave.style.display = 'block';
      container.innerHTML = state.pools.map((pool, poolIdx) => `
        <div style="width: 360px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.05);">
          <div style="background: ${colorBg}; color: ${colorFg}; padding: 15px 20px; font-weight: bold; text-align: center; font-size: 18px; letter-spacing: 1px;">
             Grupo ${pool.name}
          </div>
          <div style="display: flex; flex-direction: column;">
            ${pool.players.map((p, pIdx) => `
              <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 15px 20px; border-bottom: 1px solid #f1f5f9;">
                
                <div style="display: flex; flex-direction: column; flex: 1; padding-right: 10px;">
                   <div style="display: flex; align-items: flex-start; gap: 10px;">
                      <span style="font-weight: 900; font-size: 15px; color: #1e293b; margin-top: 2px;">${p.bib}</span>
                      <span style="font-size: 14px; font-weight: bold; color: #0f172a; line-height: 1.2;">${escapeHTML(p.nome)}</span>
                   </div>
                   <div style="display: flex; align-items: center; gap: 6px; margin-top: 6px; margin-left: 25px;">
                      ${p.logo_url ? `<img src="${p.logo_url}" style="height: 16px; max-width: 24px; object-fit: contain; border-radius: 2px; border: 1px solid #e2e8f0; background: white;">` : ''}
                      <span style="font-size: 11px; color: #64748b; font-weight: bold; text-transform: uppercase;">${escapeHTML(p.clube_nome_completo || p.clube_sigla || '-')}</span>
                   </div>
                </div>
                
                <button class="btn-swap" data-pool="${poolIdx}" data-player="${pIdx}" style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: bold; cursor: pointer; color: #475569; transition: 0.2s; margin-top: 2px;">Trocar</button>
              
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');

      qsAll('.btn-swap').forEach(btn => {
          btn.addEventListener('click', (e) => {
              const poolIdx = parseInt(btn.dataset.pool);
              const playerIdx = parseInt(btn.dataset.player);
              openSwapModal(poolIdx, playerIdx);
          });
          btn.addEventListener('mouseover', () => btn.style.background = '#e2e8f0');
          btn.addEventListener('mouseout', () => btn.style.background = '#f8fafc');
      });
  }

  const modalSwap = qs('#modal-swap');
  const swapTarget = qs('#swap-target');

  function openSwapModal(pIdx, plIdx) {
      swapData = { pool: pIdx, player: plIdx };
      const player = state.pools[pIdx].players[plIdx];
      qs('#swap-player-name').textContent = `${player.bib} - ${player.nome}`;

      swapTarget.innerHTML = '';
      state.pools.forEach((pool, i) => {
          pool.players.forEach((p, j) => {
              if (i === pIdx && j === plIdx) return;
              swapTarget.innerHTML += `<option value="${i}-${j}">Grupo ${pool.name} ➔ ${p.bib} - ${p.nome}</option>`;
          });
      });

      modalSwap.showModal();
  }

  qs('#btn-swap-cancel').onclick = () => modalSwap.close();
  qs('#btn-swap-confirm').onclick = () => {
      if (!swapData || !swapTarget.value) return;
      const [tPool, tPlayer] = swapTarget.value.split('-').map(Number);
      
      const temp = state.pools[swapData.pool].players[swapData.player];
      state.pools[swapData.pool].players[swapData.player] = state.pools[tPool].players[tPlayer];
      state.pools[tPool].players[tPlayer] = temp;

      state.pools[swapData.pool].players.sort((a, b) => parseInt(a.bib) - parseInt(b.bib));
      state.pools[tPool].players.sort((a, b) => parseInt(a.bib) - parseInt(b.bib));

      modalSwap.close();
      renderGroups();
  };

  qs('#btn-generate').onclick = distributeGroupsPots;

  function getSeedingPositions(size) {
      let bracket = [1, 2];
      for (let c = 2; c < size; c *= 2) {
          let next = [];
          for (let i = 0; i < bracket.length; i++) {
              next.push(bracket[i], 2 * c + 1 - bracket[i]);
          }
          bracket = next;
      }
      return bracket;
  }

  const POOL_KNOCKOUT_MAPPINGS = {
      1: { size: 2, map: { 1:'A1', 2:'A2' } },
      2: { size: 4, map: { 1:'A1', 2:'B1', 3:'A2', 4:'B2' } },
      3: { size: 8, map: { 1:'A1', 2:'B1', 3:'C1', 4:'C2', 5:'B2', 6:'A2' } },
      4: { size: 8, map: { 1:'A1', 2:'B1', 3:'C1', 4:'D1', 5:'B2', 6:'A2', 7:'D2', 8:'C2' } },
      5: { size: 16, map: { 1:'A1', 2:'B1', 3:'C1', 4:'D1', 5:'E1', 6:'A2', 7:'D2', 8:'C2', 9:'B2', 10:'E2' } },
      6: { size: 16, map: { 1:'A1', 2:'B1', 3:'C1', 4:'D1', 5:'E1', 6:'F1', 7:'A2', 8:'B2', 9:'C2', 10:'D2', 11:'E2', 12:'F2' } },
      7: { size: 16, map: { 1:'A1', 2:'B1', 3:'C1', 4:'D1', 5:'E1', 6:'F1', 7:'G1', 8:'C2', 9:'B2', 10:'A2', 11:'D2', 12:'G2', 13:'F2', 14:'E2' } },
      8: { size: 16, map: { 1:'A1', 2:'B1', 3:'C1', 4:'D1', 5:'E1', 6:'F1', 7:'G1', 8:'H1', 9:'B2', 10:'A2', 11:'C2', 12:'D2', 13:'F2', 14:'E2', 15:'G2', 16:'H2' } }
  };

  qs('#btn-save-draw').onclick = async () => {
      const btn = qs('#btn-save-draw');
      btn.disabled = true;
      btn.textContent = 'Salvando e Gerando Jogos...';

      try {
          const drawId = `DRAW_${state.compId}_${state.classCode}`;
          const drawPayload = {
              competition_id: String(state.compId),
              class_code: state.classCode,
              format: { type: state.formatMode, groups_count: state.formatMode === 'GROUP' ? state.pools.length : 0 },
              groups: state.formatMode === 'GROUP' ? state.pools : [],
              seeds: state.formatMode === 'PURE_KNOCKOUT' ? state.koDraw : [],
              created_at: new Date().toISOString()
          };

          await setDoc(doc(db, "draws", drawId), drawPayload);

          if (state.formatMode === 'GROUP' && state.pools.length > 0) {
              const matchesGroup = [];
              let matchCounter = 1;

              state.pools.forEach(pool => {
                  const pList = pool.players;
                  const rounds = {};
                  const dummy = pList.length % 2 !== 0 ? { id: 'BYE', nome: 'BYE', name: 'BYE' } : null;
                  const entrants = [...pList];
                  if (dummy) entrants.push(dummy);
                  const numE = entrants.length;
                  
                  // 🔥 REGRA PARA 2 ATLETAS: Se for 1 grupo com 2 atletas, gera ida e volta (2 matches)
                  const isSpecialTwoAthletes = (state.athletes.length === 2 && state.pools.length === 1);
                  const totalRounds = isSpecialTwoAthletes ? 2 : (numE - 1);
                  const half = numE / 2;

                  let rot = [...entrants];
                  
                  for (let r = 0; r < totalRounds; r++) {
                      rounds[`Round ${r + 1}`] = [];
                      for (let i = 0; i < half; i++) {
                          let pA = rot[i];
                          let pB = rot[numE - 1 - i];
                          
                          // No segundo jogo dos 2 atletas, inverte vermelho e azul
                          if (isSpecialTwoAthletes && r === 1) {
                              const temp = pA;
                              pA = pB;
                              pB = temp;
                          }
                          
                          if (pA.id !== 'BYE' && pB.id !== 'BYE') {
                              rounds[`Round ${r + 1}`].push({
                                  id: `m_${state.classCode}_G${pool.name}_R${r+1}_${matchCounter}`,
                                  match_number: matchCounter++,
                                  match_type: 'GROUP',
                                  pool_name: pool.name,
                                  round_name: `Round ${r + 1}`,
                                  class_code: state.classCode,
                                  status: 'SCHEDULED',
                                  entrant1_id: pA.id, 
                                  entrant_a_id: pA.id,
                                  entrant1_name: pA.nome || pA.name || 'A Definir',
                                  entrant_a_name: pA.nome || pA.name || 'A Definir',
                                  p1_name: pA.nome || pA.name || 'A Definir',
                                  p1_bib: pA.bib || '-',
                                  p1_club_sigla: pA.sigla_final || pA.clube_sigla || '-',
                                  p1_club_nome: pA.clube_nome_completo || pA.clube_nome || '-',
                                  p1_logo: pA.logo_url || null,
                                  
                                  entrant2_id: pB.id, 
                                  entrant_b_id: pB.id,
                                  entrant2_name: pB.nome || pB.name || 'A Definir',
                                  entrant_b_name: pB.nome || pB.name || 'A Definir',
                                  p2_name: pB.nome || pB.name || 'A Definir',
                                  p2_bib: pB.bib || '-',
                                  p2_club_sigla: pB.sigla_final || pB.clube_sigla || '-',
                                  p2_club_nome: pB.clube_nome_completo || pB.clube_nome || '-',
                                  p2_logo: pB.logo_url || null,
                                  
                                  score1: 0, score2: 0, court: '', match_date: '', start_time: ''
                              });
                          }
                      }
                      rot.splice(1, 0, rot.pop());
                  }
                  matchesGroup.push({ pool_name: pool.name, rounds: rounds });
              });

              await setDoc(doc(db, "matches_group", `MG_${state.compId}_${state.classCode}`), {
                  competition_id: String(state.compId),
                  class_code: state.classCode,
                  matches: matchesGroup
              });

              const numPools = state.pools.length;
              const mapping = POOL_KNOCKOUT_MAPPINGS[numPools];
              
              // 🔥 REGRA PARA NÃO GERAR FINAL FANTASMA SE FOR SÓ 1 GRUPO
              if (mapping && numPools > 1) {
                  const bracketSize = mapping.size;
                  const seedingOrder = getSeedingPositions(bracketSize);
                  let koCounter = 1;
                  const koMatches = [];

                  let initialRoundName = 'Eliminatórias';
                  if (bracketSize === 2) initialRoundName = 'Final';
                  else if (bracketSize === 4) initialRoundName = 'Semi-Final';
                  else if (bracketSize === 8) initialRoundName = 'Quarter Final';
                  else if (bracketSize === 16) initialRoundName = 'Round of 16';

                  for (let i = 0; i < bracketSize; i += 2) {
                      const seed1 = seedingOrder[i];
                      const seed2 = seedingOrder[i + 1];

                      const slot1Code = mapping.map[seed1];
                      const slot2Code = mapping.map[seed2];

                      const pA = slot1Code ? { id: `POOL_${slot1Code}`, nome: `${slot1Code.charAt(1)}º do Grupo ${slot1Code.charAt(0)}`, bib: '-', clube_sigla: 'A Definir', clube_nome_completo: 'A Definir', logo_url: null } : { id: 'BYE', nome: 'BYE', bib: '', clube_sigla: '', clube_nome_completo: '', logo_url: null };
                      const pB = slot2Code ? { id: `POOL_${slot2Code}`, nome: `${slot2Code.charAt(1)}º do Grupo ${slot2Code.charAt(0)}`, bib: '-', clube_sigla: 'A Definir', clube_nome_completo: 'A Definir', logo_url: null } : { id: 'BYE', nome: 'BYE', bib: '', clube_sigla: '', clube_nome_completo: '', logo_url: null };

                      koMatches.push({
                          id: `m_${state.classCode}_KO_R1_${koCounter}`,
                          match_number: koCounter++,
                          match_type: 'KO',
                          round_name: initialRoundName,
                          class_code: state.classCode,
                          status: (pA.id === 'BYE' || pB.id === 'BYE') ? 'COMPLETED' : 'SCHEDULED',
                          
                          entrant1_id: pA.id, 
                          entrant_a_id: pA.id,
                          entrant1_name: pA.nome || pA.name || 'A Definir',
                          entrant_a_name: pA.nome || pA.name || 'A Definir',
                          p1_name: pA.nome || pA.name || 'A Definir',
                          p1_bib: pA.bib || '-',
                          p1_club_sigla: pA.clube_sigla || '-',
                          p1_club_nome: pA.clube_nome_completo || '-',
                          p1_logo: pA.logo_url || null,
                          
                          entrant2_id: pB.id, 
                          entrant_b_id: pB.id,
                          entrant2_name: pB.nome || pB.name || 'A Definir',
                          entrant_b_name: pB.nome || pB.name || 'A Definir',
                          p2_name: pB.nome || pB.name || 'A Definir',
                          p2_bib: pB.bib || '-',
                          p2_club_sigla: pB.clube_sigla || '-',
                          p2_club_nome: pB.clube_nome_completo || '-',
                          p2_logo: pB.logo_url || null,
                          
                          score1: pB.id === 'BYE' ? 1 : 0,
                          score2: pA.id === 'BYE' ? 1 : 0,
                          winner_id: pB.id === 'BYE' ? pA.id : (pA.id === 'BYE' ? pB.id : null),
                          court: '', match_date: '', start_time: ''
                      });
                  }

                  await setDoc(doc(db, "matches_ko", `MK_${state.compId}_${state.classCode}`), {
                      competition_id: String(state.compId),
                      class_code: state.classCode,
                      data: koMatches
                  });
              }
          }

          if (state.formatMode === 'PURE_KNOCKOUT') {
              const numAthletes = state.koDraw.length;
              let bracketSize = 2;
              while (bracketSize < numAthletes) bracketSize *= 2;

              const seedingOrder = getSeedingPositions(bracketSize);
              let matchCounter = 1;
              const koMatches = [];

              let initialRoundName = 'Eliminatórias';
              if (bracketSize === 2) initialRoundName = 'Final';
              else if (bracketSize === 4) initialRoundName = 'Semi-Final';
              else if (bracketSize === 8) initialRoundName = 'Quarter Final';
              else if (bracketSize === 16) initialRoundName = 'Round of 16';
              else if (bracketSize === 32) initialRoundName = 'Round of 32';

              for (let i = 0; i < bracketSize; i += 2) {
                  const seed1 = seedingOrder[i];
                  const seed2 = seedingOrder[i + 1];

                  const pA = seed1 <= numAthletes ? state.koDraw[seed1 - 1] : { id: 'BYE', nome: 'BYE', bib: '', clube_sigla: '', clube_nome_completo: '', logo_url: null };
                  const pB = seed2 <= numAthletes ? state.koDraw[seed2 - 1] : { id: 'BYE', nome: 'BYE', bib: '', clube_sigla: '', clube_nome_completo: '', logo_url: null };

                  koMatches.push({
                      id: `m_${state.classCode}_KO_R1_${matchCounter}`,
                      match_number: matchCounter++,
                      match_type: 'KO',
                      round_name: initialRoundName,
                      class_code: state.classCode,
                      status: (pA.id === 'BYE' || pB.id === 'BYE') ? 'COMPLETED' : 'SCHEDULED',
                      
                      entrant1_id: pA.id, 
                      entrant_a_id: pA.id,
                      entrant1_name: pA.nome || pA.name || 'A Definir',
                      entrant_a_name: pA.nome || pA.name || 'A Definir',
                      p1_name: pA.nome || pA.name || 'A Definir',
                      p1_bib: pA.bib || '-',
                      p1_club_sigla: pA.clube_sigla || '-',
                      p1_club_nome: pA.clube_nome_completo || '-',
                      p1_logo: pA.logo_url || null,
                      
                      entrant2_id: pB.id, 
                      entrant_b_id: pB.id,
                      entrant2_name: pB.nome || pB.name || 'A Definir',
                      entrant_b_name: pB.nome || pB.name || 'A Definir',
                      p2_name: pB.nome || pB.name || 'A Definir',
                      p2_bib: pB.bib || '-',
                      p2_club_sigla: pB.clube_sigla || '-',
                      p2_club_nome: pB.clube_nome_completo || '-',
                      p2_logo: pB.logo_url || null,
                      
                      score1: pB.id === 'BYE' ? 1 : 0,
                      score2: pA.id === 'BYE' ? 1 : 0,
                      winner_id: pB.id === 'BYE' ? pA.id : (pA.id === 'BYE' ? pB.id : null),
                      court: '', match_date: '', start_time: ''
                  });
              }

              await setDoc(doc(db, "matches_ko", `MK_${state.compId}_${state.classCode}`), {
                  competition_id: String(state.compId),
                  class_code: state.classCode,
                  data: koMatches
              });
          }

          showToast("Sorteio e Chaves salvos com sucesso!", "success");
          setTimeout(() => {
              location.hash = `#/competitions/view?id=${state.compId}`;
          }, 1500);

      } catch (err) {
          showToast(`Erro ao salvar sorteio: ${err.message}`, "error");
          btn.disabled = false;
          btn.textContent = '💾 SALVAR E GERAR JOGOS (GRUPOS + ELIMINATÓRIAS)';
      }
  };
}

export default renderDrawPage;