// client/js/pages/competition-schedule.js

import { db } from '../firebase-config.js';
import { collection, getDocs, getDoc, doc, setDoc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

export async function renderCompetitionSchedule(root, hashData) {
  const auth = getAuth();
  let isAdmin = false;

  let competitionId = null;

  const hash = window.location.hash || '';
  const idMatch = hash.match(/[?&]id=([a-zA-Z0-9_-]+)/) || hash.match(/\/competitions\/([a-zA-Z0-9_-]+)/);
  if (idMatch) {
      competitionId = idMatch[1];
  } else if (hashData && (hashData.id || hashData.competitionId)) {
      competitionId = hashData.id || hashData.competitionId;
  }

  if (!competitionId) {
    root.innerHTML = `<div class="alert alert-danger" style="margin:20px; padding:20px;">Erro crítico: ID da competição ausente. Volte ao Dashboard.</div>`;
    return;
  }

  const DRAFT_STORAGE_KEY = `wb_schedule_draft_${competitionId}`;
  const CONFIG_STORAGE_KEY = `wb_schedule_config_${competitionId}`;

  // Resgata as preferências do usuário
  let savedConfig = { startDate: '', endDate: '', dayStart: '08:00', dayEnd: '20:00', courts: 8, interval: 10, slotHeight: 40 };
  try {
      const c = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (c) savedConfig = { ...savedConfig, ...JSON.parse(c) };
  } catch(e) {}

  const state = {
    competition: {},
    allMatches: [],
    officials: [],
    timeSlots: [], 
    classes: [],
    classesDataMap: {}, 
    currentTab: 'MAIN', 
    
    config: savedConfig,
    viewDateIndex: 0,
    availableDays: [],
    draftSchedule: [],
    expandedClasses: {},
    hasUnsavedChanges: false,
    
    lastGridScroll: 0,
    lastSidebarScroll: 0
  };

  const API = {
    getComp: async () => {
        const docRef = doc(db, "competitions", String(competitionId));
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : {};
    },
    getMatches: async () => {
        let allMatches = [];

        const qGroup = query(collection(db, "matches_group"), where("competition_id", "==", String(competitionId)));
        const snapGroup = await getDocs(qGroup);
        snapGroup.forEach(doc => {
            const data = doc.data();
            const classCode = data.class_code;
            const pools = data.matches || data.data || [];
            pools.forEach(pool => {
                Object.values(pool.rounds || {}).forEach(roundMatches => {
                    roundMatches.forEach(m => {
                        allMatches.push({
                            ...m,
                            class_code: classCode,
                            match_type: 'GROUP',
                            pool_name: pool.pool_name,
                            p1_name: m.entrant1_name,
                            p1_club: m.p1_club_nome || m.entrant1_club_nome || m.p1_club_sigla || m.entrant1_club_sigla,
                            p1_bib: m.entrant1_bib,
                            p1_score: m.score1,
                            p1_logo: m.p1_logo || m.entrant1_logo || null,
                            p2_name: m.entrant2_name,
                            p2_club: m.p2_club_nome || m.entrant2_club_nome || m.p2_club_sigla || m.entrant2_club_sigla,
                            p2_bib: m.entrant2_bib,
                            p2_score: m.score2,
                            p2_logo: m.p2_logo || m.entrant2_logo || null
                        });
                    });
                });
            });
        });

        const qKo = query(collection(db, "matches_ko"), where("competition_id", "==", String(competitionId)));
        const snapKo = await getDocs(qKo);
        snapKo.forEach(doc => {
            const data = doc.data();
            const classCode = data.class_code;
            const koMatches = data.matches || data.data || [];
            koMatches.forEach(m => {
                allMatches.push({
                    ...m,
                    class_code: classCode,
                    match_type: 'KO',
                    p1_name: m.entrant_a_name || m.entrant1_name,
                    p1_club: m.p1_club_nome || m.entrant_a_club_nome || m.entrant1_club_nome || m.p1_club_sigla || m.entrant_a_club_sigla || m.entrant1_club_sigla,
                    p1_bib: m.entrant_a_bib || m.entrant1_bib,
                    p1_score: m.score_a || m.score1,
                    p1_logo: m.p1_logo || m.entrant_a_logo || m.entrant1_logo || null,
                    p2_name: m.entrant_b_name || m.entrant2_name,
                    p2_club: m.p2_club_nome || m.entrant_b_club_nome || m.entrant2_club_nome || m.p2_club_sigla || m.entrant_b_club_sigla || m.entrant2_club_sigla,
                    p2_bib: m.entrant_b_bib || m.entrant2_bib,
                    p2_score: m.score_b || m.score2,
                    p2_logo: m.p2_logo || m.entrant_b_logo || m.entrant2_logo || null
                });
            });
        });

        return { success: true, data: allMatches };
    },
    getOfficials: async () => {
        const q = query(collection(db, "competition_officials"), where("competition_id", "==", String(competitionId)));
        const snap = await getDocs(q);
        if (!snap.empty) return { success: true, data: snap.docs[0].data().officials || [] };
        return { success: true, data: [] };
    },
    getTimeSlots: async () => {
        try {
           const q = query(collection(db, "time_slots"), where("competition_id", "==", String(competitionId)));
           const snap = await getDocs(q);
           const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
           return { success: true, data };
        } catch(e) { return { success: true, data: [] }; }
    },
    getClasses: async () => {
      try {
        const snap = await getDocs(collection(db, "classes"));
        snap.forEach(doc => { 
            const c = doc.data();
            state.classesDataMap[c.codigo || c.code || doc.id] = { bg: c.ui_bg || '#f8f9fa', fg: c.ui_fg || '#212529', match_time: c.match_time || c.tempo_partida || '50' }; 
        });
      } catch (e) {}
    },
    
    saveScheduleBatch: async (draftArray) => {
        const qGroup = query(collection(db, "matches_group"), where("competition_id", "==", String(competitionId)));
        const snapGroup = await getDocs(qGroup);
        const qKo = query(collection(db, "matches_ko"), where("competition_id", "==", String(competitionId)));
        const snapKo = await getDocs(qKo);
        
        const draftMap = {};
        draftArray.forEach(d => { draftMap[String(d.matchId)] = d; });

        for (const docSnap of snapGroup.docs) {
            let data = docSnap.data();
            let pools = data.matches || data.data || [];
            let modified = false;
            
            pools.forEach(pool => {
                Object.values(pool.rounds || {}).forEach(roundMatches => {
                    roundMatches.forEach((m, idx) => {
                        const sId = String(m.id);
                        if (draftMap[sId]) {
                            const d = draftMap[sId];
                            if (String(m.court) !== String(d.court) || m.match_date !== d.match_date || m.start_time !== d.start_time) {
                                roundMatches[idx] = { ...m, court: d.court, match_date: d.match_date, start_time: d.start_time };
                                modified = true;
                            }
                        } else if (m.court) {
                            if (String(m.status).toUpperCase() === 'SCHEDULED_WITH_BYE' || String(m.p1_name).toUpperCase() === 'BYE') return;
                            roundMatches[idx] = { ...m, court: null, match_date: null, start_time: null };
                            modified = true;
                        }
                    });
                });
            });
            if (modified) {
                const updateField = data.matches ? 'matches' : 'data';
                await updateDoc(docSnap.ref, { [updateField]: pools });
            }
        }

        for (const docSnap of snapKo.docs) {
            let data = docSnap.data();
            let kos = data.matches || data.data || [];
            let modified = false;
            
            kos.forEach((m, idx) => {
                const sId = String(m.id);
                if (draftMap[sId]) {
                    const d = draftMap[sId];
                    if (String(m.court) !== String(d.court) || m.match_date !== d.match_date || m.start_time !== d.start_time) {
                        kos[idx] = { ...m, court: d.court, match_date: d.match_date, start_time: d.start_time };
                        modified = true;
                    }
                } else if (m.court) {
                    if (String(m.status).toUpperCase() === 'SCHEDULED_WITH_BYE' || String(m.p1_name).toUpperCase() === 'BYE') return;
                    kos[idx] = { ...m, court: null, match_date: null, start_time: null };
                    modified = true;
                }
            });
            if (modified) {
                const updateField = data.matches ? 'matches' : 'data';
                await updateDoc(docSnap.ref, { [updateField]: kos });
            }
        }
    },

    saveReferee: async (mId, payload) => {
        let matchDocId = null; let isGroup = true; let collectionName = "matches_group";
        const qg = query(collection(db, "matches_group"), where("competition_id", "==", String(competitionId)));
        const snapg = await getDocs(qg);
        let currentArray = null;

        snapg.forEach(d => {
            let pools = d.data().matches || d.data().data || [];
            pools.forEach(pool => {
                Object.values(pool.rounds || {}).forEach(roundMatches => {
                    let idx = roundMatches.findIndex(x => String(x.id) === String(mId));
                    if(idx !== -1) { matchDocId = d.id; currentArray = pools; roundMatches[idx] = { ...roundMatches[idx], ...payload }; }
                });
            });
        });

        if (!matchDocId) {
            isGroup = false; collectionName = "matches_ko";
            const qk = query(collection(db, "matches_ko"), where("competition_id", "==", String(competitionId)));
            const snapk = await getDocs(qk);
            snapk.forEach(d => {
                let kos = d.data().matches || d.data().data || [];
                let idx = kos.findIndex(x => String(x.id) === String(mId));
                if(idx !== -1) { matchDocId = d.id; currentArray = kos; kos[idx] = { ...kos[idx], ...payload }; }
            });
        }
        if (matchDocId) {
            const fieldToUpdate = isGroup ? "matches" : "data";
            await updateDoc(doc(db, collectionName, matchDocId), { [fieldToUpdate]: currentArray });
        }
    },
    saveTimeSlot: async (payload) => {
      const tsId = `${competitionId}_${payload.match_date}_${payload.start_time}`.replace(/[:\/]/g, '-');
      await setDoc(doc(db, "time_slots", tsId), {
          competition_id: String(competitionId),
          match_date: payload.match_date,
          start_time: payload.start_time,
          call_room_ids: JSON.stringify(payload.call_room_ids),
          rest_ids: JSON.stringify(payload.rest_ids)
      }, { merge: true });
    }
  };

  function saveConfigLocally() {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(state.config));
  }

  function saveDraftLocally() {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(state.draftSchedule));
      state.hasUnsavedChanges = true;
      const ind = document.getElementById('save-indicator');
      if (ind) { ind.style.opacity = '1'; ind.innerHTML = '⚠️ Rascunho Guardado (Pendente Publicação)'; ind.style.color = '#f59e0b'; setTimeout(() => { ind.style.opacity = '0.7'; }, 2000); }
  }

  function clearDraftLocally() {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      state.hasUnsavedChanges = false;
  }

  function hhmmToMin(str) { if (!str) return 0; const [h, m] = str.split(':').map(Number); return (h * 60) + (m || 0); }
  function minToHhmm(min) { const h = String(Math.floor(min / 60)).padStart(2, '0'); const m = String(Math.floor(min % 60)).padStart(2, '0'); return `${h}:${m}`; }
  function durationToMinutes(str) {
      if (!str) return 50; const parts = String(str).split(':').map(n => +n || 0);
      if (parts.length === 1) return parts[0] > 0 ? parts[0] : 50; 
      if (parts[0] > 0 && parts[0] < 10) return (parts[0] * 60) + (parts[1] || 0); 
      if (parts[0] === 0 && parts[1] > 0) return parts[1]; 
      return parts[0] > 0 ? parts[0] : 50; 
  }
  function escapeHTML(str) { if (!str) return '-'; return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

  function formatMatchTitle(m) {
      const isGroup = m.match_type === 'GROUP' || (m.round_name && m.round_name.toLowerCase().includes('round')) || m.pool_id;
      let mNum = (m.match_number && String(m.match_number) !== 'null') ? `Jogo ${m.match_number}` : '';

      if (isGroup) {
          let pName = m.pool_name || '';
          if (pName === 'null' || pName === 'undefined' || pName === '-') pName = '';
          if (pName && !pName.toLowerCase().includes('grupo')) pName = `Grupo ${pName}`;
          pName = pName.replace(/Grupo\s+Grupo/ig, 'Grupo');

          let rLabel = m.round_name || '';
          if (rLabel === 'null' || rLabel === 'undefined') rLabel = '';
          if (rLabel.toLowerCase().includes('round')) rLabel = rLabel.replace(/Round/i, 'Rodada');

          const parts = [mNum, pName, rLabel].filter(Boolean);
          return parts.length > 0 ? parts.join(' - ') : 'Fase de Grupos';
      } else {
          let rLabel = m.round_name || 'Eliminatórias';
          if (rLabel === 'null' || rLabel === 'undefined') rLabel = 'Eliminatórias';
          const map = {'Quarter Final': 'Quartas de Final', 'Semi-Final': 'Semi Final', 'Playoffs': 'Playoffs', 'Final': 'Final', '3rd Place': 'Disputa de 3º'};
          rLabel = map[rLabel] || rLabel;
          return mNum ? `${rLabel} - ${mNum}` : rLabel;
      }
  }

  // 🔥 BUSCA NOME, CLUBE E A LOGO DO TIME
  function getParticipantDisplay(m, side) {
      const isGroup = m.match_type === 'GROUP' || (m.round_name && m.round_name.toLowerCase().includes('round')) || m.pool_id;
      
      const eId = side === 1 ? m.entrant1_id : m.entrant2_id;
      let pName = side === 1 ? m.p1_name : m.p2_name; 
      let ruleName = side === 1 ? (m.entrant_a_name || m.entrant1_name) : (m.entrant_b_name || m.entrant2_name);
      let bib = side === 1 ? m.p1_bib : m.p2_bib;
      let club = side === 1 ? m.p1_club : m.p2_club;
      let logo = side === 1 ? m.p1_logo : m.p2_logo;

      if (pName === 'null' || pName === 'undefined') pName = '';
      if (ruleName === 'null' || ruleName === 'undefined') ruleName = '';
      if (bib === 'null' || bib === 'undefined' || bib === '-') bib = '';
      if (club === 'null' || club === 'undefined' || club === '-') club = '';

      let canShowName = true;

      if (!isGroup) {
          const classGroupMatches = state.allMatches.filter(x => x.class_code === m.class_code && (x.match_type === 'GROUP' || (x.round_name && x.round_name.toLowerCase().includes('round')) || x.pool_id));
          const groupsFinished = classGroupMatches.length === 0 || classGroupMatches.every(x => x.status === 'COMPLETED');
          if (!groupsFinished) {
              canShowName = false; 
          } else {
              const rLower = ruleName.toLowerCase();
              if (rLower.includes('venc') || rLower.includes('perd') || rLower.includes('jogo')) {
                  const matchNumRegex = /\d+/;
                  const extractedNum = ruleName.match(matchNumRegex);
                  if (extractedNum && extractedNum[0]) {
                      const refMatch = state.allMatches.find(x => x.class_code === m.class_code && String(x.match_number) === String(extractedNum[0]));
                      if (refMatch && refMatch.status !== 'COMPLETED') canShowName = false;
                  }
              }
          }
      }

      if (canShowName && eId && pName && pName !== '-') {
          let finalName = bib ? `${bib} - ${pName}` : pName;
          return { display: escapeHTML(finalName), club: escapeHTML(club), logo: logo };
      } else {
          return { display: escapeHTML(ruleName || '-'), club: '', logo: null };
      }
  }
  
  function calculateDays() {
    if (!state.config.startDate || !state.config.endDate) { state.availableDays = []; return; }
    const start = new Date(state.config.startDate + 'T00:00:00');
    const end = new Date(state.config.endDate + 'T00:00:00');
    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yy = d.getFullYear();
      days.push(`${yy}-${mm}-${dd}`);
    }
    state.availableDays = days;
  }

  async function loadData() {
    root.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; height:50vh; flex-direction:column;"><div style="width:40px; height:40px; border:4px solid #f3f3f3; border-top:4px solid #0d6efd; border-radius:50%; animation:spin 1s linear infinite;"></div><p style="margin-top:15px; color:#64748b; font-family:sans-serif;">A sincronizar a Agenda Oficial na nuvem...</p><style>@keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}</style></div>`;
    
    onAuthStateChanged(auth, async (user) => {
        isAdmin = !!user;
        
        try {
          const [comp, matchesRes, offRes, tsRes, dummyClasses] = await Promise.all([
            API.getComp(), API.getMatches(), API.getOfficials(), API.getTimeSlots(), API.getClasses() 
          ]);
          
          state.competition = comp;
          state.officials = offRes.success ? offRes.data : [];
          
          state.timeSlots = (tsRes && tsRes.success ? tsRes.data : []).map(ts => ({
              ...ts, call_room_ids: typeof ts.call_room_ids === 'string' ? JSON.parse(ts.call_room_ids || '[]') : (ts.call_room_ids||[]), rest_ids: typeof ts.rest_ids === 'string' ? JSON.parse(ts.rest_ids || '[]') : (ts.rest_ids||[])
          }));

          if (matchesRes.success) {
              state.allMatches = matchesRes.data.filter(m => {
                  const isGroup = m.match_type === 'GROUP' || (m.round_name && m.round_name.toLowerCase().includes('round')) || m.pool_id;
                  if (String(m.status).toUpperCase() === 'SCHEDULED_WITH_BYE') return false;
                  if (String(m.entrant_a_name).toUpperCase() === 'BYE' || String(m.entrant_b_name).toUpperCase() === 'BYE') return false;
                  if (String(m.p1_name).toUpperCase() === 'BYE' || String(m.p2_name).toUpperCase() === 'BYE') return false;
                  
                  if (isGroup) {
                      const hasA = m.entrant1_id || m.entrant_a_name;
                      const hasB = m.entrant2_id || m.entrant_b_name;
                      if (!hasA || String(hasA) === '-' || String(hasA) === 'null') return false;
                      if (!hasB || String(hasB) === '-' || String(hasB) === 'null') return false;
                  }
                  return true;
              });
          } else { state.allMatches = []; }

          let minDate = comp.data_inicio || comp.start_date || new Date().toISOString().split('T')[0];
          let maxDate = comp.data_fim || comp.end_date || minDate;

          const dbDates = state.allMatches.filter(m => m.match_date).map(m => m.match_date);
          let draftDates = [];
          let localDraftObj = null;
          try {
              const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
              if (raw) { localDraftObj = JSON.parse(raw); draftDates = localDraftObj.map(d => d.match_date); }
          } catch(e){}

          const allFoundDates = [...dbDates, ...draftDates].sort();
          if (allFoundDates.length > 0) {
              if (allFoundDates[0] < minDate) minDate = allFoundDates[0];
              if (allFoundDates[allFoundDates.length - 1] > maxDate) maxDate = allFoundDates[allFoundDates.length - 1];
          }
          
          if (!state.config.startDate) state.config.startDate = minDate;
          if (!state.config.endDate) state.config.endDate = maxDate;
          
          calculateDays();
          
          const today = new Date().toISOString().split('T')[0];
          let startIdx = state.availableDays.indexOf(today);
          if (startIdx === -1) { startIdx = allFoundDates.length > 0 ? state.availableDays.indexOf(allFoundDates[0]) : 0; }
          state.viewDateIndex = startIdx !== -1 ? startIdx : 0;
          
          const uniqueClasses = [...new Set(state.allMatches.map(m => m.class_code))].filter(Boolean);
          uniqueClasses.forEach(c => { if(state.expandedClasses[c] === undefined) state.expandedClasses[c] = false; });

          if (localDraftObj && localDraftObj.length > 0) {
              state.draftSchedule = localDraftObj;
              state.hasUnsavedChanges = true;
          } else {
              state.draftSchedule = state.allMatches.filter(m => m.court && m.match_date && m.start_time).map(m => ({ matchId: String(m.id), court: m.court, match_date: m.match_date, start_time: m.start_time }));
              state.hasUnsavedChanges = false;
          }
          
          render();
        } catch (e) {
          root.innerHTML = `<div class="alert alert-danger" style="margin:20px; padding:20px;">Erro de carregamento: ${e.message}</div>`;
        }
    });
  }

  function render() {
    const headerTitle = isAdmin ? "Gestão de Agenda e Oficiais" : "Agenda Oficial de Jogos";

    const styles = `
      <style>
        .wb-container { max-width: 1600px; margin: 0 auto; padding: 20px; font-family: sans-serif; }
        .wb-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 20px; }
        .tabs-container { display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid #cbd5e1; padding-bottom: 10px; }
        .tab-btn { background: #f8fafc; border: 1px solid #cbd5e1; padding: 10px 20px; border-radius: 8px 8px 0 0; font-size: 14px; font-weight: bold; color: #64748b; cursor: pointer; border-bottom: none; transition: all 0.2s; }
        .tab-btn:hover { background: #e2e8f0; }
        .tab-btn.active { background: #0d6efd; color: white; border-color: #0d6efd; }
        .btn-outline { border: 1px solid #cbd5e1; background: white; color: #475569; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; }
        .btn-outline:hover { background: #f1f5f9; }
        .btn-primary { background: #0d6efd; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: background 0.2s; }
        .btn-primary:hover { background: #0b5ed7; }
        .btn-primary.unsaved { background: #f59e0b; color: white; animation: pulseBtn 2s infinite; }
        .btn-primary.unsaved:hover { background: #d97706; }
        @keyframes pulseBtn { 0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.5); } 70% { box-shadow: 0 0 0 8px rgba(245, 158, 11, 0); } 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); } }
        
        .builder-controls { background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; margin-bottom: 15px; display: flex; gap: 15px; align-items: flex-end; flex-wrap: wrap; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
        .ctrl-group { display: flex; flex-direction: column; gap: 4px; }
        .ctrl-group label { font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; }
        .ctrl-input { padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px; }
        .day-nav { display: flex; align-items: center; gap: 10px; background: #f1f5f9; padding: 5px 15px; border-radius: 20px; border: 1px solid #cbd5e1; margin-left: auto; }
        .day-nav button { background: none; border: none; font-size: 18px; cursor: pointer; color: #0d6efd; font-weight: bold; }
        .day-nav button:disabled { color: #cbd5e1; cursor: not-allowed; }
        .day-nav span { font-weight: bold; font-size: 15px; color: #0f172a; min-width: 100px; text-align: center; }
        #save-indicator { margin-left: 15px; font-weight: bold; font-size: 12px; opacity: 0; transition: opacity 0.3s; }
        .builder-wrapper { display: flex; gap: 20px; height: 75vh; }
        .sidebar-matches { width: 320px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; padding-bottom: 50px; }
        .class-accordion { border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; background: #fff; flex-shrink: 0; }
        .class-header { padding: 10px 15px; font-weight: bold; font-size: 14px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; user-select: none; }
        .class-body { padding: 10px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: none; }
        .class-body.active { display: block; }
        .phase-group { margin-bottom: 10px; }
        .phase-title { font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom: 5px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 3px; }
        .match-drag-item { background: #fff; border: 1px solid #cbd5e1; padding: 10px; margin-bottom: 8px; border-radius: 4px; cursor: grab; font-size: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .match-drag-item:active { cursor: grabbing; opacity: 0.8; }
        .player-line { margin: 4px 0; color: #1e293b; line-height: 1.3; white-space: normal; word-wrap: break-word;}
        .club-sigla { font-size: 10px; color: #64748b; font-weight: bold; text-transform: uppercase; display:block; margin-top:2px; }
        .grid-container { flex: 1; display: flex; flex-direction: column; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
        .grid-header-row { display: flex; background: #f1f5f9; border-bottom: 1px solid #cbd5e1; position: sticky; top: 0; z-index: 20; }
        .grid-header-corner { width: 60px; border-right: 1px solid #cbd5e1; flex-shrink: 0; }
        .court-header { flex: 1; text-align: center; font-weight: bold; font-size: 13px; padding: 8px 0; border-right: 1px dashed #cbd5e1; color: #0f172a; }
        .court-header:last-child { border-right: none; }
        .grid-body { display: flex; flex: 1; overflow-y: auto; overflow-x: hidden; position: relative; }
        .time-axis { width: 60px; background: #f8fafc; border-right: 1px solid #cbd5e1; position: relative; flex-shrink: 0; }
        .time-label { position: absolute; right: 8px; font-size: 11px; color: #64748b; transform: translateY(-50%); }
        .courts-area { flex: 1; position: relative; display: flex; min-width: 600px; }
        .court-col-divider { flex: 1; border-right: 1px dashed #cbd5e1; pointer-events: none; }
        .court-col-divider:last-child { border-right: none; }
        .scheduled-block { position: absolute; border-radius: 6px; padding: 6px 8px; overflow: hidden; cursor: grab; box-shadow: 0 4px 10px rgba(0,0,0,0.2); user-select: none; border: 1px solid rgba(0,0,0,0.3); color: white; display: flex; flex-direction: column; justify-content: center; z-index: 5; text-align: center; box-sizing: border-box; }
        .scheduled-block:active { z-index: 15; opacity: 0.9; transform: scale(0.98); }
        .scheduled-block:hover { z-index: 12; }
        .sb-header { font-weight: bold; font-size: 11px; margin-bottom: 2px; display: flex; justify-content: space-between; }
        .sb-title { font-size: 11px; font-weight: bold; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.4); text-transform: uppercase; }
        .sb-players { display: flex; flex-direction: column; flex: 1; justify-content: center; align-items: center; gap: 2px; }
        .sb-player-row { font-size: 10px; font-weight: 700; line-height: 1.1; word-wrap: break-word; white-space: normal; width: 100%; text-align: center; }
        .sb-club { font-size: 8px; font-weight: normal; opacity: 0.9; text-transform: uppercase; display: block; margin-top: 1px; }
        .sb-vs { text-align: center; font-size: 10px; opacity: 0.8; font-weight: 900; margin: 2px 0; }
        .wb-table { width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #cbd5e1; }
        .wb-table th { background: #f8fafc; padding: 12px; text-align: left; border-bottom: 2px solid #cbd5e1; color: #475569; }
        .wb-table td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
        .select-referee { padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1; width: 100%; font-size: 13px; }

        @media print {
            body * { visibility: hidden; }
            .wb-container { padding: 0 !important; margin: 0 !important; width: 100% !important; max-width: none !important; }
            #schedule-content-area, #schedule-content-area *,
            #ref-content-area, #ref-content-area *,
            #print-ref-area, #print-ref-area * { visibility: visible; }
            #schedule-content-area, #ref-content-area, #print-ref-area { position: absolute; left: 0; top: 0; width: 100%; }
            .print-grid-day { page-break-inside: avoid; margin-bottom: 20px !important; border: 1px solid #000 !important; }
            .start-list-table th, .start-list-table td, .ref-list-table th, .ref-list-table td { border: 1px solid #000 !important; padding: 6px !important; font-size: 13px !important; text-align:center; }
            .start-list-table tr, .ref-list-table tr { page-break-inside: avoid; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      </style>
    `;

    let tabsHtml = '';
    if (isAdmin) {
      tabsHtml = `
        <div class="tabs-container">
            <button class="tab-btn ${state.currentTab === 'MAIN' ? 'active' : ''}" data-tab="MAIN">Visão Geral da Agenda</button>
            <button class="tab-btn ${state.currentTab === 'BUILDER' ? 'active' : ''}" data-tab="BUILDER">Fazer Agenda (Drag & Drop)</button>
            <button class="tab-btn ${state.currentTab === 'REFEREES' ? 'active' : ''}" data-tab="REFEREES">Escala de Arbitragem</button>
            <button class="tab-btn ${state.currentTab === 'LOGBOOK' ? 'active' : ''}" data-tab="LOGBOOK">Logbook</button>
        </div>
      `;
    }

    root.innerHTML = `
      ${styles}
      <div class="wb-container">
        <div class="wb-header">
          <div>
            <h1 style="margin: 0; font-size: 26px;">${headerTitle}</h1>
            <p style="margin: 4px 0 0 0; color: #64748b;">${escapeHTML(state.competition.nome || state.competition.name)}</p>
          </div>
          <button class="btn-outline" onclick="window.history.back()">← Voltar</button>
        </div>

        ${tabsHtml}

        <div id="tab-content"></div>
      </div>
    `;

    if(isAdmin) bindTabEvents();
    renderCurrentTab();
  }

  function bindTabEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = (e) => {
        state.currentTab = e.target.dataset.tab;
        render(); 
      };
    });
  }

  function renderCurrentTab() {
    const content = document.getElementById('tab-content');
    if (state.currentTab === 'BUILDER' && isAdmin) renderBuilderTab(content);
    else if (state.currentTab === 'REFEREES' && isAdmin) renderRefereesTab(content);
    else if (state.currentTab === 'LOGBOOK' && isAdmin) renderLogbookTab(content);
    else renderMainTab(content);
  }

  // ==========================================================================
  // ABA 2: FAZER AGENDA
  // ==========================================================================
  function renderBuilderTab(container) {
    const savedGridScroll = state.lastGridScroll || 0;
    const savedSidebarScroll = state.lastSidebarScroll || 0;

    const currentViewDate = state.availableDays[state.viewDateIndex] || '';
    const formattedDate = currentViewDate ? currentViewDate.split('-').reverse().join('/') : 'Sem Datas';

    const scheduledToday = state.draftSchedule.filter(d => d.match_date === currentViewDate);

    const btnClass = state.hasUnsavedChanges ? 'btn-primary unsaved' : 'btn-primary';
    const btnText = state.hasUnsavedChanges ? '⚠️ Publicar Agenda Oficial' : '✔️ Agenda Oficial Sincronizada';

    let controlsHtml = `
      <div class="builder-controls">
         <div class="ctrl-group">
            <label>Início da Comp.</label>
            <input type="date" id="conf-start" class="ctrl-input" value="${state.config.startDate}">
         </div>
         <div class="ctrl-group">
            <label>Fim da Comp.</label>
            <input type="date" id="conf-end" class="ctrl-input" value="${state.config.endDate}">
         </div>
         <div class="ctrl-group">
            <label>Hora Inicial</label>
            <input type="time" id="conf-h-start" class="ctrl-input" value="${state.config.dayStart}">
         </div>
         <div class="ctrl-group">
            <label>Hora Final</label>
            <input type="time" id="conf-h-end" class="ctrl-input" value="${state.config.dayEnd}">
         </div>
         <div class="ctrl-group">
            <label>Nº Quadras</label>
            <select id="conf-courts" class="ctrl-input">
              ${[1,2,3,4,5,6,7,8,9,10,12,14,16].map(c => `<option value="${c}" ${state.config.courts == c ? 'selected' : ''}>${c} Quadras</option>`).join('')}
            </select>
         </div>
         
         <div class="day-nav">
            <button id="btn-prev-day" ${state.viewDateIndex <= 0 ? 'disabled' : ''}>←</button>
            <span>${formattedDate}</span>
            <button id="btn-next-day" ${state.viewDateIndex >= state.availableDays.length - 1 ? 'disabled' : ''}>→</button>
         </div>

         <div id="save-indicator"></div>
         <button id="btn-reset-schedule" class="btn-outline" style="margin-left: auto; color: #ef4444; border-color: #fca5a5; background: #fef2f2;">🗑️ Resetar Agenda</button>
         <button class="${btnClass}" id="btn-save-official" style="margin-left: 10px;">${btnText}</button>
      </div>
    `;

    let sidebarHtml = ``;
    const matchesByClass = {};
    const unscheduled = state.allMatches.filter(m => !state.draftSchedule.some(d => String(d.matchId) === String(m.id)));

    state.allMatches.forEach(m => {
        const cCode = m.class_code || 'Desconhecida';
        if (!matchesByClass[cCode]) matchesByClass[cCode] = { groups: [], kos: [], totalReal: 0, totalScheduled: 0 };
        matchesByClass[cCode].totalReal++;
        if (state.draftSchedule.some(d => String(d.matchId) === String(m.id))) matchesByClass[cCode].totalScheduled++;
    });

    unscheduled.forEach(m => {
        const cCode = m.class_code || 'Desconhecida';
        const isKO = m.match_type === 'KO' || m.match_type === 'KNOCKOUT' || (m.round_name && !m.round_name.toLowerCase().includes('round') && !m.round_name.toLowerCase().includes('grupo'));
        if (isKO) matchesByClass[cCode].kos.push(m);
        else matchesByClass[cCode].groups.push(m);
    });

    Object.keys(matchesByClass).sort().forEach(cCode => {
        const data = matchesByClass[cCode];
        if (data.totalReal === data.totalScheduled && data.totalReal > 0) return; 
        const classData = state.classesDataMap[cCode] || { bg: '#64748b', fg: '#ffffff', match_time: '50' };
        
        let groupsHtml = '';
        if (data.groups.length > 0) {
            const rounds = {};
            data.groups.forEach(m => {
                let rLabel = m.round_name || 'Rodadas de Grupo';
                if(rLabel === 'null') rLabel = 'Rodadas de Grupo';
                if(rLabel.toLowerCase().includes('round')) rLabel = rLabel.replace(/Round/i, 'Rodada');
                if(!rounds[rLabel]) rounds[rLabel] = [];
                rounds[rLabel].push(m);
            });
            Object.keys(rounds).sort().forEach(rName => {
                groupsHtml += `<div class="phase-group"><div class="phase-title">${rName}</div>`;
                rounds[rName].forEach(m => groupsHtml += renderDraggableCardSidebar(m, classData));
                groupsHtml += `</div>`;
            });
        }

        let kosHtml = '';
        if (data.kos.length > 0) {
            const koRounds = {};
            data.kos.forEach(m => {
                let rLabel = m.round_name || 'Eliminatórias';
                if (rLabel === 'null') rLabel = 'Eliminatórias';
                const map = {'Quarter Final': 'Quartas de Final', 'Semi-Final': 'Semi Final', 'Playoffs': 'Playoffs', 'Final': 'Final', '3rd Place': 'Disputa de 3º'};
                rLabel = map[rLabel] || rLabel;
                if(!koRounds[rLabel]) koRounds[rLabel] = [];
                koRounds[rLabel].push(m);
            });
            Object.keys(koRounds).forEach(rName => {
                kosHtml += `<div class="phase-group"><div class="phase-title">${rName}</div>`;
                koRounds[rName].forEach(m => kosHtml += renderDraggableCardSidebar(m, classData));
                kosHtml += `</div>`;
            });
        }

        const isExpanded = state.expandedClasses[cCode];
        sidebarHtml += `
          <div class="class-accordion">
            <div class="class-header" data-code="${cCode}" style="background-color: ${classData.bg}; color: ${classData.fg};">
               <span>${escapeHTML(cCode)}</span>
               <span style="font-size:12px; background:rgba(255,255,255,0.3); padding:4px 10px; border-radius:12px; font-weight:900;">${data.totalScheduled} / ${data.totalReal}</span>
            </div>
            <div class="class-body ${isExpanded ? 'active' : ''}">${groupsHtml}${kosHtml}</div>
          </div>
        `;
    });

    if (sidebarHtml === '') sidebarHtml = `<p style="color:#94a3b8; font-size:13px; text-align:center; padding: 40px 0;">Todos os jogos estão na grelha!</p>`;

    function renderDraggableCardSidebar(m, classData) {
        const titleStr = formatMatchTitle(m);
        const p1Data = getParticipantDisplay(m, 1);
        const p2Data = getParticipantDisplay(m, 2);
        return `
          <div class="match-drag-item" draggable="true" data-id="${m.id}" style="border-left-color: ${classData.bg};">
             <div style="font-weight:bold; color:#0f172a; margin-bottom:6px;">${escapeHTML(m.class_code)} • ${escapeHTML(titleStr)}</div>
             <div class="player-line">${p1Data.display} <br><span class="club-sigla">${p1Data.club}</span></div>
             <div style="font-size:10px; font-weight:bold; color:#94a3b8; margin: 4px 0; border-top: 1px solid #f1f5f9; padding-top: 4px;">VS</div>
             <div class="player-line">${p2Data.display} <br><span class="club-sigla">${p2Data.club}</span></div>
          </div>
        `;
    }

    const startM = hhmmToMin(state.config.dayStart);
    const endM = hhmmToMin(state.config.dayEnd);
    const interval = state.config.interval;
    const displayStartM = startM - interval;
    const displayEndM = endM + interval;
    const totalM = Math.max(0, displayEndM - displayStartM);
    const pxPerMin = state.config.slotHeight / interval;
    const totalHeight = totalM * pxPerMin;

    let courtsHtmlHeaders = '';
    let courtDividers = '';
    for (let c = 1; c <= state.config.courts; c++) {
        courtsHtmlHeaders += `<div class="court-header">Quadra ${c}</div>`;
        courtDividers += `<div class="court-col-divider"></div>`;
    }

    let timeAxisHtml = '';
    for (let t = displayStartM; t <= displayEndM; t += interval) {
        const top = (t - displayStartM) * pxPerMin;
        timeAxisHtml += `<div class="time-label" style="top: ${top}px;">${minToHhmm(t)}</div>`;
    }

    container.innerHTML = `
      ${controlsHtml}
      <div class="builder-wrapper">
         <div class="sidebar-matches" id="drag-source">${sidebarHtml}</div>
         <div class="grid-container">
            <div class="grid-header-row"><div class="grid-header-corner"></div><div style="display:flex; flex:1;">${courtsHtmlHeaders}</div></div>
            <div class="grid-body" id="grid-scroll-area">
               <div class="time-axis" style="height: ${totalHeight}px;">${timeAxisHtml}</div>
               <div class="courts-area" id="drop-target" style="height: ${totalHeight}px; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent ${state.config.slotHeight - 1}px, #cbd5e1 ${state.config.slotHeight - 1}px, #cbd5e1 ${state.config.slotHeight}px); background-size: 100% ${state.config.slotHeight}px;">
                  ${courtDividers}
                  <div id="drag-ghost" style="display: none; position: absolute; background: rgba(13, 110, 253, 0.25); border: 2px dashed #0d6efd; pointer-events: none; z-index: 10; border-radius: 6px;"></div>
               </div>
            </div>
         </div>
      </div>
    `;

    const dropTarget = container.querySelector('#drop-target');

    scheduledToday.forEach(d => {
        const m = state.allMatches.find(x => String(x.id) === String(d.matchId));
        if (!m) return;
        const classData = state.classesDataMap[m.class_code] || { bg: '#3b82f6', fg: '#ffffff', match_time: '50' };
        const durMin = durationToMinutes(classData.match_time); 
        const mStart = hhmmToMin(d.start_time);
        const topPx = (mStart - displayStartM) * pxPerMin; 
        const durPx = durMin * pxPerMin;
        
        if (d.court > state.config.courts) return;

        const courtIndex = d.court - 1;
        const leftPercent = (courtIndex / state.config.courts) * 100;
        const widthPercent = (1 / state.config.courts) * 100;
        const titleStr = formatMatchTitle(m);
        const p1Data = getParticipantDisplay(m, 1);
        const p2Data = getParticipantDisplay(m, 2);

        const block = document.createElement('div');
        block.className = 'scheduled-block match-drag-item'; 
        block.draggable = true; block.dataset.id = m.id; block.dataset.duration = durMin; 
        block.style.top = `${topPx}px`; block.style.left = `calc(${leftPercent}% + 8px)`; block.style.width = `calc(${widthPercent}% - 16px)`; block.style.height = `${Math.max(durPx, 70)}px`;
        block.style.backgroundColor = classData.bg; block.style.color = classData.fg;
        
        block.innerHTML = `
            <div class="sb-header"><span>${d.start_time} - ${minToHhmm(mStart + durMin)}</span><span>${escapeHTML(m.class_code)}</span></div>
            <div class="sb-title">${escapeHTML(titleStr)}</div>
            <div class="sb-players">
               <div class="sb-player-row">${p1Data.display}<br><span class="sb-club">${p1Data.club}</span></div>
               <div class="sb-vs">VS</div>
               <div class="sb-player-row">${p2Data.display}<br><span class="sb-club">${p2Data.club}</span></div>
            </div>
        `;
        block.ondblclick = () => { 
            state.lastGridScroll = document.getElementById('grid-scroll-area')?.scrollTop || 0;
            state.lastSidebarScroll = document.getElementById('drag-source')?.scrollTop || 0;
            
            state.draftSchedule = state.draftSchedule.filter(x => String(x.matchId) !== String(d.matchId)); 
            saveDraftLocally(); 
            renderCurrentTab(); 
        };
        dropTarget.appendChild(block);
    });

    const gridScrollArea = container.querySelector('#grid-scroll-area');
    const sidebarScrollArea = container.querySelector('#drag-source');
    if (gridScrollArea) gridScrollArea.scrollTop = savedGridScroll;
    if (sidebarScrollArea) sidebarScrollArea.scrollTop = savedSidebarScroll;

    bindBuilderEvents(startM, displayStartM, pxPerMin, currentViewDate);
  }

  function bindBuilderEvents(startM, displayStartM, pxPerMin, currentViewDate) {
    document.querySelectorAll('.class-header').forEach(header => {
        header.onclick = () => { state.expandedClasses[header.dataset.code] = !state.expandedClasses[header.dataset.code]; renderCurrentTab(); };
    });

    const updateConfig = () => {
        const inpStart = document.getElementById('conf-start'); const inpEnd = document.getElementById('conf-end'); const inpHStart = document.getElementById('conf-h-start'); const inpHend = document.getElementById('conf-h-end'); const inpCourts = document.getElementById('conf-courts');
        if(inpStart) state.config.startDate = inpStart.value; if(inpEnd) state.config.endDate = inpEnd.value; if(inpHStart) state.config.dayStart = inpHStart.value; if(inpHend) state.config.dayEnd = inpHend.value; if(inpCourts) state.config.courts = parseInt(inpCourts.value, 10);
        
        saveConfigLocally(); 
        calculateDays(); state.viewDateIndex = 0; renderCurrentTab();
    };

    ['conf-start', 'conf-end', 'conf-h-start', 'conf-h-end', 'conf-courts'].forEach(id => {
        const el = document.getElementById(id); if (el) el.addEventListener('change', updateConfig);
    });

    document.getElementById('btn-prev-day').addEventListener('click', () => { if (state.viewDateIndex > 0) { state.viewDateIndex--; renderCurrentTab(); } });
    document.getElementById('btn-next-day').addEventListener('click', () => { if (state.viewDateIndex < state.availableDays.length - 1) { state.viewDateIndex++; renderCurrentTab(); } });

    const btnReset = document.getElementById('btn-reset-schedule');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (confirm("ATENÇÃO: Deseja limpar TODOS os jogos da agenda? (Eles voltarão para a lista lateral)")) {
                state.draftSchedule = [];
                saveDraftLocally();
                renderCurrentTab();
            }
        });
    }

    const btnSave = document.getElementById('btn-save-official');
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            if (!state.hasUnsavedChanges) return; 
            btnSave.disabled = true; btnSave.textContent = "A Publicar...";
            try {
                await API.saveScheduleBatch(state.draftSchedule);
                clearDraftLocally(); 
                window.__toast?.("Agenda Oficial publicada com sucesso!", "success");
                setTimeout(() => window.location.reload(true), 1000);
            } catch (err) { alert("Erro ao gravar: " + err.message); btnSave.disabled = false; btnSave.textContent = "⚠️ Publicar Agenda Oficial"; } 
        });
    }

    document.querySelectorAll('.match-drag-item').forEach(item => {
        item.addEventListener('dragstart', (e) => { e.dataTransfer.setData('match_id', item.dataset.id); setTimeout(() => item.style.opacity = '0.4', 0); });
        item.addEventListener('dragend', () => { item.style.opacity = '1'; const ghost = document.getElementById('drag-ghost'); if(ghost) ghost.style.display = 'none'; });
    });

    const dropTarget = document.getElementById('drop-target');
    if (!dropTarget) return;

    dropTarget.addEventListener('dragover', (e) => {
        e.preventDefault();
        const ghost = document.getElementById('drag-ghost');
        if(!ghost) return;
        const rect = dropTarget.getBoundingClientRect();
        const x = e.clientX - rect.left; const y = e.clientY - rect.top;
        const courtWidth = rect.width / state.config.courts;
        const courtIndex = Math.floor(x / courtWidth);
        let dropTimeMin = (y / pxPerMin) + displayStartM;
        if (dropTimeMin < startM) dropTimeMin = startM; 
        dropTimeMin = Math.round(dropTimeMin / 5) * 5; 
        
        ghost.style.display = 'block';
        ghost.style.top = `${(dropTimeMin - displayStartM) * pxPerMin}px`;
        ghost.style.left = `calc(${(courtIndex / state.config.courts) * 100}% + 8px)`; 
        ghost.style.width = `calc(${(1 / state.config.courts) * 100}% - 16px)`;
        ghost.style.height = `${Math.max(50 * pxPerMin, 70)}px`; 
    });

    dropTarget.addEventListener('drop', (e) => {
        e.preventDefault();
        document.getElementById('drag-ghost').style.display = 'none';
        const matchId = e.dataTransfer.getData('match_id');
        if (!matchId || !currentViewDate) return;

        const rect = dropTarget.getBoundingClientRect();
        const x = e.clientX - rect.left; const y = e.clientY - rect.top;
        const courtWidth = rect.width / state.config.courts;
        const courtId = Math.floor(x / courtWidth) + 1;
        
        let dropTimeMin = (y / pxPerMin) + displayStartM;
        dropTimeMin = Math.round(dropTimeMin / 5) * 5; 
        if (dropTimeMin < startM) dropTimeMin = startM;

        state.lastGridScroll = document.getElementById('grid-scroll-area')?.scrollTop || 0;
        state.lastSidebarScroll = document.getElementById('drag-source')?.scrollTop || 0;

        state.draftSchedule = state.draftSchedule.filter(d => String(d.matchId) !== String(matchId));
        state.draftSchedule.push({ matchId: String(matchId), court: courtId, match_date: currentViewDate, start_time: minToHhmm(dropTimeMin) });

        saveDraftLocally(); 
        renderCurrentTab();
    });
  }

  // ==========================================================================
  // ABA 3: ESCALA DE ARBITRAGEM
  // ==========================================================================
  function renderRefereesTab(container) {
    let currentRefView = container.dataset.view || 'table'; 

    const scheduled = state.allMatches.filter(m => m.court && m.match_date && m.start_time);
    scheduled.sort((a,b) => {
        if(a.match_date !== b.match_date) return a.match_date.localeCompare(b.match_date);
        if(a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
        return (a.court || 0) - (b.court || 0);
    });

    const matchRolesAllowed = ['Árbitro', 'Cursista'];
    
    function generateMatchRefOptions(selectedId) {
        return state.officials.filter(o => {
            return matchRolesAllowed.includes(o.role) || String(selectedId) === String(o.referee_id || o.id);
        }).map(o => `<option value="${o.referee_id || o.id}" ${String(selectedId) === String(o.referee_id || o.id) ? 'selected' : ''}>${escapeHTML(o.nome_abreviado || o.nome_completo || o.nome)}</option>`).join('');
    }

    function generateAllRefOptions(selectedId) {
        return state.officials.map(o => `<option value="${o.referee_id || o.id}" ${String(selectedId) === String(o.referee_id || o.id) ? 'selected' : ''}>${escapeHTML(o.nome_abreviado || o.nome_completo || o.nome)}</option>`).join('');
    }

    function getRefName(id) {
        if (!id) return '-';
        const o = state.officials.find(x => String(x.referee_id || x.id) === String(id));
        return o ? escapeHTML(o.nome_abreviado || o.nome_completo || o.nome) : '-';
    }

    const groupedMatches = {};
    scheduled.forEach(m => {
        const key = `${m.match_date}|${m.start_time}`;
        if (!groupedMatches[key]) groupedMatches[key] = [];
        groupedMatches[key].push(m);
    });

    let html = `
      <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #cbd5e1;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:15px; flex-wrap: wrap; gap: 10px;">
           <h3 style="margin:0; font-size: 20px; color: #0f172a;">Escala de Arbitragem</h3>
           <div style="display:flex; gap:10px; align-items:center; flex-wrap: wrap;">
               <div style="background:#f1f5f9; padding:4px; border-radius:6px; display:flex; gap:2px; border:1px solid #cbd5e1;">
                   <button class="btn-ref-view" data-view="table" style="padding:6px 15px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px; background:${currentRefView==='table'?'#fff':'transparent'}; box-shadow:${currentRefView==='table'?'0 1px 3px rgba(0,0,0,0.1)':'none'}; color:${currentRefView==='table'?'#0f172a':'#64748b'};">Atribuição (Tabela)</button>
                   <button class="btn-ref-view" data-view="grid" style="padding:6px 15px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px; background:${currentRefView==='grid'?'#fff':'transparent'}; box-shadow:${currentRefView==='grid'?'0 1px 3px rgba(0,0,0,0.1)':'none'}; color:${currentRefView==='grid'?'#0f172a':'#64748b'};">Grelha Visual (Grade)</button>
               </div>
               <div style="width:1px; height:30px; background:#cbd5e1; margin: 0 5px;"></div>
               <button class="btn-outline btn-print-ref-pdf" data-orientation="portrait" style="display:flex; align-items:center; gap:6px;">🖨️ Imprimir (Retrato)</button>
               <button class="btn-outline btn-print-ref-pdf" data-orientation="landscape" style="display:flex; align-items:center; gap:6px;">🖨️ Imprimir (Paisagem)</button>
           </div>
        </div>
        <div id="ref-content-area" style="overflow-x:auto;">
    `;

    if (scheduled.length === 0) {
        html += `<div style="text-align:center; padding:30px;">Nenhum jogo publicado na Agenda Oficial.</div>`;
    } else if (currentRefView === 'table') {
        html += `<table class="wb-table ref-list-table"><thead><tr><th style="width:70px;">Quadra</th><th style="width:120px;">Classe / Jogo</th><th style="width:180px;">Confronto</th><th>Árbitro Principal / Sombra</th><th>Linha / Mesa</th></tr></thead><tbody>`;
        
        Object.keys(groupedMatches).sort().forEach(key => {
            const [date, time] = key.split('|');
            const matchesInSlot = groupedMatches[key];
            const ts = state.timeSlots.find(x => x.match_date === date && x.start_time === time) || { call_room_ids:[], rest_ids:[] };

            const safeCallIds = Array.isArray(ts.call_room_ids) ? ts.call_room_ids : [];
            const safeRestIds = Array.isArray(ts.rest_ids) ? ts.rest_ids : [];

            html += `
              <tr style="background:#e2e8f0; border-top: 2px solid #94a3b8;">
                  <td style="text-align:center; font-weight:bold; font-size:15px; padding:12px; color:#1e293b; border-right:none;">
                      ${time}<br><span style="font-size:11px; font-weight:normal;">${date.split('-').reverse().join('/')}</span>
                  </td>
                  <td colspan="2" style="border-left:none;"></td>
                  <td style="background:#f8fafc; padding:8px; border-left: 2px solid #94a3b8;">
                      <div style="font-size:11px; font-weight:bold; color:#b45309; text-align:center; margin-bottom:4px;">Câmara de Chamada</div>
                      <div style="display:flex; justify-content:center; gap:4px;">
                          ${[0,1,2,3].map(i => `<select class="ts-sel" data-date="${date}" data-time="${time}" data-type="call_room" style="width:90px; padding:2px; font-size:11px; border-radius:4px; border:1px solid #cbd5e1;"><option value="">-</option>${generateAllRefOptions(safeCallIds[i])}</select>`).join('')}
                      </div>
                  </td>
                  <td style="background:#f8fafc; padding:8px;">
                      <div style="font-size:11px; font-weight:bold; color:#475569; text-align:center; margin-bottom:4px;">Descanso / Sem Jogo</div>
                      <div style="display:flex; justify-content:center; gap:4px;">
                          ${[0,1,2,3].map(i => `<select class="ts-sel" data-date="${date}" data-time="${time}" data-type="rest" style="width:90px; padding:2px; font-size:11px; border-radius:4px; border:1px solid #cbd5e1;"><option value="">-</option>${generateAllRefOptions(safeRestIds[i])}</select>`).join('')}
                      </div>
                  </td>
              </tr>
            `;

            matchesInSlot.forEach(m => {
                const p1Data = getParticipantDisplay(m, 1);
                const p2Data = getParticipantDisplay(m, 2);
                const titleStr = formatMatchTitle(m);
                
                html += `
                  <tr>
                     <td style="text-align:center; font-size:16px; font-weight:bold; color:#0f172a;">Q. ${m.court}</td>
                     <td style="font-size:11px;"><strong>${escapeHTML(m.class_code)}</strong><br>${escapeHTML(titleStr)}</td>
                     <td style="font-size:11px;">${p1Data.display}<br>vs<br>${p2Data.display}</td>
                     <td>
                        <div style="display:flex; flex-direction:column; gap:4px; text-align:left;">
                            <span style="font-size:10px; font-weight:bold; color:#475569;">Árbitro Principal:</span>
                            <select class="ref-select" data-matchid="${m.id}" data-date="${date}" data-time="${time}" data-field="principal_id" style="width:100%; padding:4px; font-size:12px; font-weight:bold; border:1px solid #cbd5e1; border-radius:4px;"><option value="">-- Selecionar --</option>${generateMatchRefOptions(m.referee_principal_id || m.referee_id)}</select>
                            <span style="font-size:10px; font-weight:bold; color:#b45309; margin-top:2px;">Sombra / Avaliador:</span>
                            <select class="ref-select" data-matchid="${m.id}" data-date="${date}" data-time="${time}" data-field="shadow_id" style="width:100%; padding:4px; font-size:12px; border:1px solid #f59e0b; border-radius:4px;"><option value="">-- Sombra --</option>${generateMatchRefOptions(m.referee_shadow_id)}</select>
                        </div>
                     </td>
                     <td>
                        <div style="display:flex; flex-direction:column; gap:4px; text-align:left;">
                            <span style="font-size:10px; font-weight:bold; color:#475569;">Árbitro de Linha:</span>
                            <select class="ref-select" data-matchid="${m.id}" data-date="${date}" data-time="${time}" data-field="linha_id" style="width:100%; padding:4px; font-size:12px; border:1px solid #cbd5e1; border-radius:4px;"><option value="">-- Selecionar Linha --</option>${generateMatchRefOptions(m.referee_linha_id)}</select>
                            <span style="font-size:10px; font-weight:bold; color:#475569; margin-top:2px;">Oficial de Mesa:</span>
                            <select class="ref-select" data-matchid="${m.id}" data-date="${date}" data-time="${time}" data-field="mesa_id" style="width:100%; padding:4px; font-size:12px; border:1px solid #cbd5e1; border-radius:4px;"><option value="">-- Selecionar Mesa --</option>${generateMatchRefOptions(m.referee_mesa_id)}</select>
                        </div>
                     </td>
                  </tr>
                `;
            });
        });
        html += `</tbody></table>`;
    } else if (currentRefView === 'grid') {
        const matchesByDay = {};
        scheduled.forEach(m => { if (!matchesByDay[m.match_date]) matchesByDay[m.match_date] = []; matchesByDay[m.match_date].push(m); });
        let gridHtml = '';
        const totalColumns = state.config.courts + 2; 

        Object.keys(matchesByDay).sort().forEach(date => {
            const dayMatches = matchesByDay[date];
            const formattedDate = date.split('-').reverse().join('/');
            const startHour = 480; 
            const pxPerMin = 4.0;

            let courtHeaders = ''; let courtCols = '';
            for (let c = 1; c <= state.config.courts; c++) {
                courtHeaders += `<div style="flex:1; text-align:center; font-weight:bold; font-size:14px; padding:8px 0; border-right:1px solid #cbd5e1;">Quadra ${c}</div>`;
                courtCols += `<div style="flex:1; border-right:1px dashed #cbd5e1;"></div>`;
            }
            courtHeaders += `<div style="flex:1; text-align:center; font-weight:bold; font-size:14px; background:#fffbeb; color:#b45309; border-right:1px solid #cbd5e1;">Chamada</div>`;
            courtHeaders += `<div style="flex:1; text-align:center; font-weight:bold; font-size:14px; background:#f1f5f9; color:#475569;">Descanso</div>`;

            let blocksHtml = '';
            const widthPct = (1 / totalColumns) * 100;

            dayMatches.forEach(m => {
                const classData = state.classesDataMap[m.class_code] || { bg: '#64748b', fg: '#ffffff', match_time: '50' };
                const durMin = durationToMinutes(classData.match_time);
                const startM = hhmmToMin(m.start_time);
                const topPx = (startM - startHour) * pxPerMin;
                
                if (m.court > state.config.courts) return; 

                const courtIdx = m.court - 1;
                const leftPct = (courtIdx / totalColumns) * 100;
                const titleStr = formatMatchTitle(m); 
                const p1Data = getParticipantDisplay(m, 1);
                const p2Data = getParticipantDisplay(m, 2);

                const refA = getRefName(m.referee_principal_id || m.referee_id);
                const refS = getRefName(m.referee_shadow_id);
                
                let lineA = `Árb: ${refA}`;

                blocksHtml += `
                    <div style="position:absolute; top:${topPx}px; left:calc(${leftPct}% + 3px); width:calc(${widthPct}% - 6px); 
                                min-height: 160px; height:${durMin * pxPerMin}px; background-color:${classData.bg}; color:${classData.fg}; 
                                border-radius:6px; padding:6px; font-size:11px; border:2px solid #000; 
                                display:flex; flex-direction:column; text-align:center; box-sizing:border-box; 
                                box-shadow: 0 4px 6px rgba(0,0,0,0.2); z-index: 5; line-height: 1.2;">
                        
                        <div style="font-weight:900; border-bottom:1px solid rgba(255,255,255,0.5); padding-bottom:3px; margin-bottom:3px; font-size:12px;">
                            ${m.start_time} • ${escapeHTML(m.class_code)} • J${m.match_number || '-'}
                        </div>
                        
                        <div style="font-weight:bold; font-size:10px; background:rgba(0,0,0,0.2); margin-bottom:4px; padding:2px; border-radius:2px;">${escapeHTML(titleStr)}</div>
                        
                        <div style="flex:1; display:flex; flex-direction:column; justify-content:flex-start; margin-bottom:4px;">
                            <div style="font-weight:900; word-wrap:break-word; font-size:11px;">${p1Data.display}</div>
                            <div style="font-weight:bold; font-size:9px; opacity:0.8;">VS</div>
                            <div style="font-weight:900; word-wrap:break-word; font-size:11px;">${p2Data.display}</div>
                        </div>

                        <div style="margin-top:auto; padding-top:4px; border-top:1px dashed rgba(255,255,255,0.6); text-align:left; font-size:11px; font-weight:bold; background:rgba(255,255,255,0.15); border-radius:4px; padding-left:4px; padding-bottom:2px;">
                            <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${lineA}</div>
                            ${refS && refS !== '-' ? `<div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#fef08a;">Aval: ${refS}</div>` : ''}
                            <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Linha: ${getRefName(m.referee_linha_id)}</div>
                            <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Mesa: ${getRefName(m.referee_mesa_id)}</div>
                        </div>
                    </div>
                `;
            });

            const dTimeSlots = state.timeSlots.filter(ts => ts.match_date === date);
            dTimeSlots.forEach(ts => {
                const startM = hhmmToMin(ts.start_time);
                if (startM < startHour) return; 
                
                const topPx = (startM - startHour) * pxPerMin;
                const blockHeight = 50 * pxPerMin; 
                
                const safeCallIds = Array.isArray(ts.call_room_ids) ? ts.call_room_ids : [];
                const safeRestIds = Array.isArray(ts.rest_ids) ? ts.rest_ids : [];

                if (safeCallIds.length > 0) {
                    const leftPctCall = (state.config.courts / totalColumns) * 100;
                    const refNames = safeCallIds.map(id => getRefName(id)).filter(n => n !== '-').join('<br>');
                    if(refNames) {
                        blocksHtml += `
                            <div style="position:absolute; top:${topPx}px; left:calc(${leftPctCall}% + 3px); width:calc(${widthPct}% - 6px); height:${blockHeight}px; background-color:#fef3c7; color:#b45309; border-radius:6px; padding:6px; font-size:12px; border:2px solid #fcd34d; display:flex; flex-direction:column; box-sizing:border-box; overflow:hidden; line-height: 1.3;">
                                <div style="font-weight:900; border-bottom:1px solid #fcd34d; padding-bottom:3px; margin-bottom:4px;">${ts.start_time}</div>
                                <div style="flex:1; display:flex; flex-direction:column; gap:3px; text-align:left; font-weight:bold;">${refNames}</div>
                            </div>
                        `;
                    }
                }

                if (safeRestIds.length > 0) {
                    const leftPctRest = ((state.config.courts + 1) / totalColumns) * 100;
                    const refNames = safeRestIds.map(id => getRefName(id)).filter(n => n !== '-').join('<br>');
                    if(refNames) {
                        blocksHtml += `
                            <div style="position:absolute; top:${topPx}px; left:calc(${leftPctRest}% + 3px); width:calc(${widthPct}% - 6px); height:${blockHeight}px; background-color:#e2e8f0; color:#475569; border-radius:6px; padding:6px; font-size:12px; border:2px solid #cbd5e1; display:flex; flex-direction:column; box-sizing:border-box; overflow:hidden; line-height: 1.3;">
                                <div style="font-weight:900; border-bottom:1px solid #cbd5e1; padding-bottom:3px; margin-bottom:4px;">${ts.start_time}</div>
                                <div style="flex:1; display:flex; flex-direction:column; gap:3px; text-align:left; font-weight:bold;">${refNames}</div>
                            </div>
                        `;
                    }
                }
            });

            let maxMin = 0;
            dayMatches.forEach(m => {
                const dur = durationToMinutes((state.classesDataMap[m.class_code]||{}).match_time);
                const end = hhmmToMin(m.start_time) + dur;
                if (end > maxMin) maxMin = end;
            });
            const endHour = Math.max(startHour + 60, Math.ceil(maxMin / 60) * 60);
            const totalHeight = (endHour - startHour) * pxPerMin;

            let timeAxis = '';
            for (let t = startHour; t <= endHour; t += 30) {
                timeAxis += `<div style="position:absolute; top:${(t - startHour) * pxPerMin}px; right:8px; font-size:11px; font-weight:bold; color:#64748b; transform:translateY(-50%);">${minToHhmm(t)}</div>`;
            }

            gridHtml += `
              <div style="margin-bottom: 40px; background:#fff; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden;" class="print-grid-day">
                 <div style="background:#0f172a; color:white; padding:8px 15px; font-weight:bold;">Grelha de Arbitragem - Dia: ${formattedDate}</div>
                 <div style="display:flex; background:#f1f5f9; border-bottom:1px solid #cbd5e1;"><div style="width:50px; border-right:1px solid #cbd5e1;"></div><div style="display:flex; flex:1;">${courtHeaders}</div></div>
                 <div style="display:flex; position:relative; min-height:${totalHeight + 50}px;">
                     <div style="width:50px; position:relative; border-right:1px solid #cbd5e1; background:#f8fafc;">${timeAxis}</div>
                     <div style="flex:1; display:flex; position:relative; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent ${(30*pxPerMin)-1}px, #e2e8f0 ${(30*pxPerMin)-1}px, #e2e8f0 ${30*pxPerMin}px);">
                         ${courtCols}${blocksHtml}
                     </div>
                 </div>
              </div>
            `;
        });
        html += gridHtml;
    }
    
    html += `</div></div>`;
    container.innerHTML = html;

    const contentAreaEvent = container.querySelector('#ref-content-area');
    if(contentAreaEvent){
        contentAreaEvent.querySelectorAll('.ts-sel, .ref-select').forEach(sel => {
            sel.dataset.prevValue = sel.value;
        });

        contentAreaEvent.querySelectorAll('.ts-sel').forEach(sel => {
            sel.addEventListener('change', async (e) => {
                const newVal = e.target.value;
                const date = e.target.dataset.date;
                const time = e.target.dataset.time;
                const type = e.target.dataset.type;
                
                if (newVal !== "") {
                    const allSelectsInSlot = contentAreaEvent.querySelectorAll(`select[data-date="${date}"][data-time="${time}"]`);
                    let count = 0;
                    allSelectsInSlot.forEach(s => { if (s.value === newVal) count++; });
                    if (count > 1) {
                        alert("⚠️ CONFLITO DE AGENDA:\nEste árbitro já está escalado para outra função ou jogo neste mesmo horário (" + time + ").");
                        e.target.value = e.target.dataset.prevValue; 
                        return;
                    }
                }
                e.target.dataset.prevValue = newVal; 

                const selects = contentAreaEvent.querySelectorAll(`.ts-sel[data-date="${date}"][data-time="${time}"][data-type="${type}"]`);
                const ids = Array.from(selects).map(s => s.value).filter(v => v !== '');

                let ts = state.timeSlots.find(x => x.match_date === date && x.start_time === time);
                if (!ts) { ts = { match_date: date, start_time: time, call_room_ids: [], rest_ids: [] }; state.timeSlots.push(ts); }
                if (type === 'call_room') ts.call_room_ids = ids;
                if (type === 'rest') ts.rest_ids = ids;

                try {
                    e.target.style.backgroundColor = '#fefce8';
                    await API.saveTimeSlot({ match_date: date, start_time: time, call_room_ids: ts.call_room_ids, rest_ids: ts.rest_ids });
                    e.target.style.backgroundColor = '#dcfce7'; 
                    setTimeout(() => e.target.style.backgroundColor = '', 1000);
                } catch (err) { alert("Erro ao gravar horário: " + err.message); }
            });
        });

        contentAreaEvent.querySelectorAll('.ref-select').forEach(sel => {
            sel.addEventListener('change', async (e) => {
                const newVal = e.target.value;
                const date = e.target.dataset.date;
                const time = e.target.dataset.time;
                const mId = e.target.dataset.matchid;
                
                if (newVal !== "") {
                    const allSelectsInSlot = contentAreaEvent.querySelectorAll(`select[data-date="${date}"][data-time="${time}"]`);
                    let count = 0;
                    allSelectsInSlot.forEach(s => { if (s.value === newVal) count++; });
                    if (count > 1) {
                        alert("⚠️ CONFLITO DE AGENDA:\nEste árbitro já está escalado para outra função ou jogo neste mesmo horário (" + time + ").");
                        e.target.value = e.target.dataset.prevValue; 
                        return;
                    }
                }
                e.target.dataset.prevValue = newVal; 

                const rootRow = e.target.closest('tr');
                const ref_id = rootRow.querySelector(`[data-field="principal_id"]`).value;
                const ref_linha_id = rootRow.querySelector(`[data-field="linha_id"]`).value;
                const ref_mesa_id = rootRow.querySelector(`[data-field="mesa_id"]`).value;
                const ref_shadow_id = rootRow.querySelector(`[data-field="shadow_id"]`).value;

                try {
                    e.target.style.backgroundColor = '#fefce8';
                    await API.saveReferee(mId, { principal_id: ref_id, referee_id: ref_id, linha_id: ref_linha_id, mesa_id: ref_mesa_id, shadow_id: ref_shadow_id, referee_linha_id: ref_linha_id, referee_mesa_id: ref_mesa_id, referee_shadow_id: ref_shadow_id });
                    const m = state.allMatches.find(x => String(x.id) === String(mId));
                    if(m) { m.referee_id = ref_id; m.referee_principal_id = ref_id; m.referee_linha_id = ref_linha_id; m.referee_mesa_id = ref_mesa_id; m.referee_shadow_id = ref_shadow_id; }
                    e.target.style.backgroundColor = '#dcfce7'; 
                    setTimeout(() => e.target.style.backgroundColor = '', 1000);
                } catch (err) { alert("Erro ao gravar oficial: " + err.message); }
            });
        });
    }

    container.querySelectorAll('.btn-ref-view').forEach(btn => {
        btn.addEventListener('click', (e) => {
            container.dataset.view = e.target.dataset.view;
            renderRefereesTab(container);
        });
    });

    container.querySelectorAll('.btn-print-ref-pdf').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const orientation = e.target.dataset.orientation;
            let styleEl = document.getElementById('print-orientation-style');
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'print-orientation-style';
                document.head.appendChild(styleEl);
            }
            styleEl.innerHTML = `@media print { @page { size: A4 ${orientation}; margin: 10mm; } }`;
            setTimeout(() => window.print(), 150);
        });
    });
  }

  // ==========================================================================
  // ABA 4: LOGBOOK
  // ==========================================================================
  function renderLogbookTab(container) {
      const scheduled = state.allMatches.filter(m => m.court && m.match_date && m.start_time);
      const uniqueDates = [...new Set(scheduled.map(m => m.match_date))].sort();

      let html = `<div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #cbd5e1;">`;
      html += `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:15px;">
             <h3 style="margin:0; font-size: 20px; color: #0f172a;">Logbook de Oficiais</h3>
             <div style="display:flex; gap:10px;">
                 <button class="btn-outline" onclick="window.print()">🖨️ Imprimir Tabela Diária</button>
                 <button class="btn-primary" id="btn-print-ind">📄 Logbook Oficial (Imprimir Documentos)</button>
             </div>
          </div>
          <div id="print-ref-area">
      `;

      if (uniqueDates.length === 0) {
          html += `<p style="text-align:center; padding:30px;">Nenhum jogo agendado para gerar logbook.</p>`;
      } else {
          uniqueDates.forEach(date => {
              const dMatches = scheduled.filter(m => m.match_date === date);
              const dayClasses = [...new Set(dMatches.map(m => m.class_code))].filter(Boolean).sort();

              let theadHtml = `<th style="text-align:left;">Oficial</th>`;
              dayClasses.forEach(c => { theadHtml += `<th>${c}</th>`; });
              theadHtml += `<th style="background:#e2e8f0;">Total Jogos</th>`;

              html += `
                  <div style="margin-bottom:30px;" class="print-grid-day">
                      <h4 style="background:#0f172a; color:white; padding:10px 15px; margin:0; border-radius:4px 4px 0 0;">Atuações Diárias - ${date.split('-').reverse().join('/')}</h4>
                      <table class="wb-table ref-list-table">
                          <thead>
                              <tr style="background:#f1f5f9;">${theadHtml}</tr>
                          </thead>
                          <tbody>
              `;

              state.officials.forEach(o => {
                  let totalDayMatches = 0;
                  let classCounts = {};
                  dayClasses.forEach(c => classCounts[c] = 0);

                  dMatches.forEach(m => {
                      const isRef =
                          String(m.referee_principal_id) === String(o.referee_id || o.id) ||
                          (!m.referee_principal_id && String(m.referee_id) === String(o.referee_id || o.id)) ||
                          String(m.referee_shadow_id) === String(o.referee_id || o.id) ||
                          String(m.referee_linha_id) === String(o.referee_id || o.id);

                      if (isRef) {
                          classCounts[m.class_code]++;
                          totalDayMatches++;
                      }
                  });

                  if (totalDayMatches > 0) {
                      html += `<tr><td style="text-align:left; font-weight:bold;">${escapeHTML(o.nome_completo || o.nome_abreviado || o.nome)}</td>`;
                      dayClasses.forEach(c => { html += `<td>${classCounts[c] > 0 ? classCounts[c] : '-'}</td>`; });
                      html += `<td style="font-weight:bold; background:#f8fafc;">${totalDayMatches}</td></tr>`;
                  }
              });

              html += `</tbody></table></div>`;
          });
      }
      html += `</div></div>`;
      container.innerHTML = html;

      const btnInd = container.querySelector('#btn-print-ind');
      if (btnInd) btnInd.onclick = showIndividualLogbookModal;
  }

  function showIndividualLogbookModal() {
      const modalId = 'modal-logbook-ind';
      let modal = document.getElementById(modalId);
      if(modal) modal.remove();

      const options = state.officials.map(o => `<option value="${o.referee_id || o.id}">${escapeHTML(o.nome_completo || o.nome_abreviado || o.nome)}</option>`).join('');

      modal = document.createElement('div');
      modal.id = modalId;
      modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:9999;';
      modal.innerHTML = `
          <div style="background:#fff; padding:25px; border-radius:8px; width:450px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h3 style="margin-top:0; color:#0f172a;">Gerar Documento Logbook</h3>
              <p style="font-size:13px; color:#64748b;">Selecione quem pretende imprimir e adicione comentários (se necessário).</p>
              
              <label style="font-size:12px; font-weight:bold;">Seleção de Árbitros:</label>
              <select id="sel-ref-ind" style="width:100%; padding:10px; margin-top:4px; margin-bottom:15px; border:1px solid #cbd5e1; border-radius:4px; font-size:14px;">
                  <option value="">-- Selecione o Oficial --</option>
                  <option value="ALL" style="font-weight:bold; background:#e2e8f0;">📄 TODOS OS ÁRBITROS (Logbook Geral)</option>
                  ${options}
              </select>

              <label style="font-size:12px; font-weight:bold;">Comentários (Opcional):</label>
              <textarea id="txt-logbook-comments" rows="3" style="width:100%; padding:10px; margin-top:4px; margin-bottom:20px; border:1px solid #cbd5e1; border-radius:4px; font-size:13px; font-family:sans-serif;" placeholder="Ex: Este comentário irá aparecer na base da folha."></textarea>
              
              <div style="display:flex; justify-content:flex-end; gap:10px;">
                  <button id="btn-cancel-ind" class="btn-outline">Cancelar</button>
                  <button id="btn-do-print-ind" class="btn-primary">Gerar Documento</button>
              </div>
          </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('btn-cancel-ind').onclick = () => modal.remove();
      document.getElementById('btn-do-print-ind').onclick = () => {
          const refId = document.getElementById('sel-ref-ind').value;
          const commentsText = document.getElementById('txt-logbook-comments').value;
          if(!refId) return alert('Selecione uma opção.');
          
          modal.remove();

          if (refId === 'ALL') {
              let refsToPrint = [];
              state.officials.forEach(ref => {
                  let total = 0;
                  state.allMatches.forEach(m => {
                      if (String(m.referee_principal_id) === String(ref.referee_id || ref.id) || (!m.referee_principal_id && String(m.referee_id) === String(ref.referee_id || ref.id)) || String(m.referee_shadow_id) === String(ref.referee_id || ref.id) || String(m.referee_linha_id) === String(ref.referee_id || ref.id)) total++;
                  });
                  if (ref.role === 'Árbitro chefe' || ref.role === 'Assistente Árbitro Chefe' || total > 0) {
                      refsToPrint.push(ref.referee_id || ref.id);
                  }
              });
              printLogbookDocument(refsToPrint, commentsText);
          } else {
              printLogbookDocument([refId], commentsText);
          }
      };
  }

  function printLogbookDocument(refIdsArray, commentsText) {
      if (!refIdsArray || refIdsArray.length === 0) return alert("Não há árbitros com atuações para imprimir.");

      const startDate = state.config.startDate ? state.config.startDate.split('-').reverse().join('/') : '';
      const endDate = state.config.endDate ? state.config.endDate.split('-').reverse().join('/') : '';
      const totalGames = state.allMatches.filter(m => String(m.status).toUpperCase() !== 'SCHEDULED_WITH_BYE').length;

      let pagesHtml = "";

      refIdsArray.forEach((refId, index) => {
          const ref = state.officials.find(o => String(o.referee_id || o.id) === String(refId));
          if(!ref) return;

          let refCount = 0; let linerCount = 0;
          state.allMatches.forEach(m => {
              if (String(m.referee_principal_id) === String(refId) || (!m.referee_principal_id && String(m.referee_id) === String(refId)) || String(m.referee_shadow_id) === String(refId)) refCount++;
              if (String(m.referee_linha_id) === String(refId)) linerCount++;
          });

          const isHR = ref.role === 'Árbitro chefe';
          const isAHR = ref.role === 'Assistente Árbitro Chefe';
          const isRef = refCount > 0;
          const isLiner = linerCount > 0;

          let signerName = ""; let signerRole = "";
          
          if (isHR) {
              const techDel = state.officials.find(o => o.role === 'Delegado Técnico');
              if (techDel) { signerName = techDel.nome_completo || techDel.nome_abreviado || techDel.nome; }
              signerRole = "Technical Delegate";
          } else {
              const headRef = state.officials.find(o => o.role === 'Árbitro chefe');
              if (headRef) { signerName = headRef.nome_completo || headRef.nome_abreviado || headRef.nome; }
              signerRole = "Head Referee";
          }

          const pageBreak = index < refIdsArray.length - 1 ? 'page-break-after: always;' : '';

          pagesHtml += `
            <div style="${pageBreak}">
              <div class="header-container">
                  <div class="logos-row">
                      <div class="logo-box" style="justify-content: flex-start;">
                          <img src="/img/world-boccia.png" alt="World Boccia">
                      </div>
                      <div class="logo-box" style="justify-content: flex-end;">
                          <img src="/img/ande.png" alt="ANDE">
                      </div>
                  </div>
                  <div class="header-title">
                      <h1>NATIONAL LOG BOOK SHEET</h1>
                  </div>
              </div>
              
              <div class="ref-info">
                  <div>Referee's Name: <strong>${ref.nome_completo || ref.nome_abreviado || ref.nome}</strong></div>
                  <div>Referee's Country: <strong>${ref.uf || '-'}</strong></div>
              </div>
              <table>
                  <tr>
                      <th>Date</th>
                      <th>Name of Tournament*<br>Competition</th>
                      <th>Function</th>
                      <th>Nº Games</th>
                      <th>${signerRole}<br>Name & Signature**</th>
                  </tr>
                  <tr>
                      <td>${startDate}<br>to<br>${endDate}</td>
                      <td><strong>${state.competition.nome || state.competition.name}</strong><br><small>${state.competition.local || ''}</small></td>
                      <td class="func-col">
                          <div class="func-row"><span class="checkbox">${isRef ? '☑' : '☐'}</span> Referee</div>
                          <div class="func-row"><span class="checkbox">${isLiner ? '☑' : '☐'}</span> Liner</div>
                          <div class="func-row"><span class="checkbox">${isHR ? '☑' : '☐'}</span> HR***</div>
                          <div class="func-row"><span class="checkbox">${isAHR ? '☑' : '☐'}</span> AHR***</div>
                      </td>
                      <td>
                          <div class="func-row" style="justify-content:center;">${refCount > 0 ? refCount : '-'}</div>
                          <div class="func-row" style="justify-content:center;">${linerCount > 0 ? linerCount : '-'}</div>
                          <div class="func-row" style="justify-content:center;">${isHR ? totalGames : '-'}</div>
                          <div class="func-row" style="justify-content:center;">${isAHR ? totalGames : '-'}</div>
                      </td>
                      
                      <td style="vertical-align:bottom; text-align:center; padding-top:40px;">
                          <div style="border-bottom: 1px solid #000; width: 80%; margin: 0 auto 5px auto;"></div>
                          <div style="font-weight:bold; font-size:12px;">${signerName}</div>
                          <div style="font-size:10px; color:#475569;">${signerRole}</div>
                      </td>
                  </tr>
                  <tr>
                      <td colspan="5" style="height: 80px; text-align:left; vertical-align:top;">
                          <strong>Comments (Optional):</strong>
                          <div style="margin-top:8px; font-size:13px; color:#1e293b; white-space:pre-wrap;">${escapeHTML(commentsText)}</div>
                      </td>
                  </tr>
              </table>
              <div class="notes">
                  <div>* Include City, Country and competition level.</div>
                  <div>** Head Referee logbooks must be signed by the Technical Delegate.</div>
                  <div>*** The number of matches for the HR and the AHR are the total of matches of the Tournament.</div>
              </div>
            </div>
          `;
      });

      const printWin = window.open('', '', 'width=900,height=600');
      printWin.document.write(`
          <html>
              <head>
                  <title>Log Book Sheet</title>
                  <style>
                      body { font-family: sans-serif; margin: 80px 40px 40px 40px; color: #000; }
                      .header-container { margin-bottom: 30px; }
                      .logos-row { display: flex; justify-content: space-between; align-items: center; }
                      .logo-box { width: 180px; height: 90px; display:flex; align-items:center; justify-content:center; }
                      .logo-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
                      .header-title { text-align: center; margin-top: 25px; }
                      .header-title h1 { margin: 0; font-size: 24px; text-transform: uppercase; }
                      .ref-info { margin-bottom: 20px; font-size: 16px; display:flex; flex-direction:column; gap:8px;}
                      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
                      th, td { border: 1px solid #000; padding: 12px; text-align: center; vertical-align: middle; }
                      th { background-color: #f1f5f9; }
                      .func-col { text-align: left; }
                      .func-row { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
                      .checkbox { font-size: 18px; font-weight:bold; }
                      .notes { font-size: 12px; margin-top: 30px; color: #475569; }
                      .notes div { margin-bottom:4px; }
                  </style>
              </head>
              <body>
                  ${pagesHtml}
              </body>
          </html>
      `);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => { printWin.print(); printWin.close(); }, 500);
  }

  function renderMainTab(container) {
    const scheduled = state.allMatches.filter(m => m.court && m.match_date && m.start_time);
    scheduled.sort((a,b) => {
        if(a.match_date !== b.match_date) return a.match_date.localeCompare(b.match_date);
        if(a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
        return (a.court || 0) - (b.court || 0);
    });

    let currentViewMode = container.dataset.view || 'list'; 

    function drawContent() {
        const contentArea = container.querySelector('#schedule-content-area');
        if (!contentArea) return;

        if (scheduled.length === 0) {
            contentArea.innerHTML = `<div style="text-align:center; padding:30px; background:#fff; border:1px solid #cbd5e1; border-radius:8px;">A agenda da competição ainda está vazia.</div>`;
            return;
        }

        if (currentViewMode === 'list') {
            let listHtml = `
              <div style="background: #fff; border-radius: 8px; border: 1px solid #cbd5e1; overflow: hidden;" id="print-area-list">
                <table class="wb-table start-list-table" style="width: 100%; border-collapse: collapse; text-align: center; font-size: 13px;">
                  <thead>
                    <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
                      <th style="padding: 10px; border-right: 1px solid #e2e8f0; width: 60px;">Hora</th>
                      <th style="padding: 10px; border-right: 1px solid #e2e8f0; text-align: right; width: 35%;">Atleta [A] / Clube</th>
                      <th style="padding: 10px; border-right: 1px solid #e2e8f0; width: 30px; text-align:center;"></th>
                      <th style="padding: 10px; border-right: 1px solid #e2e8f0; width: 20px; text-align:center;">X</th>
                      <th style="padding: 10px; border-right: 1px solid #e2e8f0; width: 30px; text-align:center;"></th>
                      <th style="padding: 10px; border-right: 1px solid #e2e8f0; text-align: left; width: 35%;">Atleta [B] / Clube</th>
                      <th style="padding: 10px; border-right: 1px solid #e2e8f0;">Fase/Chave</th>
                      <th style="padding: 10px;">Classe / Jogo</th>
                    </tr>
                  </thead>
                  <tbody>
            `;
            let currentDay = '';
            scheduled.forEach(m => {
                if (m.match_date !== currentDay) {
                    currentDay = m.match_date;
                    listHtml += `<tr style="background-color: #e2e8f0;"><td colspan="8" style="padding: 10px; font-weight: bold; text-align: left; font-size: 14px;">Dia: ${currentDay.split('-').reverse().join('/')}</td></tr>`;
                }

                const p1Data = getParticipantDisplay(m, 1);
                const p2Data = getParticipantDisplay(m, 2);
                const titleStr = formatMatchTitle(m);
                const classStr = (m.class_code || '').replace(/\s+/g, '');
                const mNumStr = (m.match_number && String(m.match_number) !== 'null') ? m.match_number : '-';

                const score1 = (m.p1_score !== null && m.p1_score !== undefined && String(m.p1_score) !== 'null') ? m.p1_score : '-';
                const score2 = (m.p2_score !== null && m.p2_score !== undefined && String(m.p2_score) !== 'null') ? m.p2_score : '-';

                listHtml += `
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                     <td style="padding: 8px; border-right: 1px solid #f1f5f9;"><strong>${m.start_time}</strong><br><span style="font-size:11px; color:#64748b;">Q.${m.court}</span></td>
                     <td style="padding: 8px; border-right: 1px solid #f1f5f9; text-align: right;">
                        <div style="font-weight: bold;">${p1Data.display}</div>
                        <div style="font-size: 11px; color: #64748b; font-weight: bold;">${p1Data.club || ''}</div>
                     </td>
                     <td style="padding: 8px; text-align: center; font-weight:bold; font-size:16px; background:#000; color:#fff; border: 1px solid #000;">${score1}</td>
                     <td style="padding: 8px; text-align: center; color: #94a3b8; font-size:11px;">x</td>
                     <td style="padding: 8px; text-align: center; font-weight:bold; font-size:16px; background:#000; color:#fff; border: 1px solid #000;">${score2}</td>
                     <td style="padding: 8px; border-right: 1px solid #f1f5f9; text-align: left;">
                        <div style="font-weight: bold;">${p2Data.display}</div>
                        <div style="font-size: 11px; color: #64748b; font-weight: bold;">${p2Data.club || ''}</div>
                     </td>
                     <td style="padding: 8px; border-right: 1px solid #f1f5f9; font-size:12px;">${escapeHTML(titleStr)}</td>
                     <td style="padding: 8px; font-weight:bold;">${escapeHTML(classStr)} - J${mNumStr}</td>
                  </tr>
                `;
            });
            listHtml += `</tbody></table></div>`;
            contentArea.innerHTML = listHtml;

        } else if (currentViewMode === 'grid') {
            const matchesByDay = {};
            scheduled.forEach(m => { if (!matchesByDay[m.match_date]) matchesByDay[m.match_date] = []; matchesByDay[m.match_date].push(m); });
            let gridHtml = '';
            Object.keys(matchesByDay).sort().forEach(date => {
                const dayMatches = matchesByDay[date];
                const formattedDate = date.split('-').reverse().join('/');
                
                let minMin = 9999; let maxMin = 0;
                dayMatches.forEach(m => {
                    const dur = durationToMinutes((state.classesDataMap[m.class_code]||{}).match_time);
                    const start = hhmmToMin(m.start_time); const end = start + dur;
                    if (start < minMin) minMin = start; if (end > maxMin) maxMin = end;
                });

                const startHour = Math.floor(minMin / 60) * 60; const endHour = Math.ceil(maxMin / 60) * 60;
                const pxPerMin = 2.0; 
                const totalHeight = (endHour - startHour) * pxPerMin;

                let courtHeaders = ''; let courtCols = '';
                for (let c = 1; c <= state.config.courts; c++) {
                    courtHeaders += `<div style="flex:1; text-align:center; font-weight:bold; font-size:12px; padding:6px 0; border-right:1px solid #cbd5e1;">Quadra ${c}</div>`;
                    courtCols += `<div style="flex:1; border-right:1px dashed #cbd5e1;"></div>`;
                }

                let blocksHtml = '';
                dayMatches.forEach(m => {
                    const classData = state.classesDataMap[m.class_code] || { bg: '#64748b', fg: '#ffffff', match_time: '50' };
                    const durMin = durationToMinutes(classData.match_time);
                    const startM = hhmmToMin(m.start_time);
                    const topPx = (startM - startHour) * pxPerMin;
                    
                    if (m.court > state.config.courts) return; 

                    const courtIdx = m.court - 1;
                    const leftPct = (courtIdx / state.config.courts) * 100;
                    const widthPct = (1 / state.config.courts) * 100;
                    
                    const p1Data = getParticipantDisplay(m, 1);
                    const p2Data = getParticipantDisplay(m, 2);

                    let mNumStr = (m.match_number && String(m.match_number) !== 'null') ? m.match_number : '-';
                    
                    const s1 = (m.p1_score !== null && m.p1_score !== undefined && String(m.p1_score) !== 'null') ? m.p1_score : '-';
                    const s2 = (m.p2_score !== null && m.p2_score !== undefined && String(m.p2_score) !== 'null') ? m.p2_score : '-';

                    blocksHtml += `
                        <div style="position:absolute; top:${topPx}px; left:calc(${leftPct}% + 2px); width:calc(${widthPct}% - 4px); 
                                    min-height: 100px; height:${durMin * pxPerMin}px; background-color:${classData.bg}; color:${classData.fg}; 
                                    border-radius:4px; padding:4px; font-size:10px; border:1.5px solid #000; 
                                    display:flex; flex-direction:column; justify-content:space-between; text-align:center; box-sizing:border-box; 
                                    box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index: 5; line-height: 1.1;">
                            
                            <div style="font-weight:bold; font-size:11px; margin-bottom:2px; border-bottom:1px solid rgba(255,255,255,0.4); padding-bottom:2px; background: rgba(0,0,0,0.1);">
                                ${m.start_time} • ${escapeHTML(m.class_code)} - J${mNumStr}
                            </div>
                            
                            <div style="flex:1; display:flex; flex-direction:column; justify-content:center; gap:2px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; padding: 0 4px;">
                                    <div style="text-align:left; flex:1; overflow:hidden;">
                                        <div style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p1Data.display}</div>
                                        <div style="font-size:9px; margin-top:4px; opacity:0.9; font-weight:bold;">${p1Data.club || ''}</div>
                                    </div>
                                    <div style="background:#000; color:#fff; font-weight:bold; padding:2px 5px; border-radius:3px; min-width:18px; margin-left:4px;">${s1}</div>
                                </div>

                                <div style="font-weight:bold; font-size:8px; margin: 1px 0; opacity:0.7;">VS</div>

                                <div style="display:flex; justify-content:space-between; align-items:center; padding: 0 4px;">
                                    <div style="text-align:left; flex:1; overflow:hidden;">
                                        <div style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p2Data.display}</div>
                                        <div style="font-size:9px; margin-top:4px; opacity:0.9; font-weight:bold;">${p2Data.club || ''}</div>
                                    </div>
                                    <div style="background:#000; color:#fff; font-weight:bold; padding:2px 5px; border-radius:3px; min-width:18px; margin-left:4px;">${s2}</div>
                                </div>
                            </div>
                        </div>
                    `;
                });

                gridHtml += `
                  <div style="margin-bottom: 40px; background:#fff; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden;" class="print-grid-day">
                     <div style="background:#0f172a; color:white; padding:8px 15px; font-weight:bold;">Agenda do Dia: ${formattedDate}</div>
                     <div style="display:flex; background:#f1f5f9; border-bottom:1px solid #cbd5e1;"><div style="width:50px; border-right:1px solid #cbd5e1;"></div><div style="display:flex; flex:1;">${courtHeaders}</div></div>
                     <div style="display:flex; position:relative; min-height:${totalHeight + 120}px;">
                         <div style="width:50px; border-right:1px solid #cbd5e1; background:#f8fafc; font-size:10px; color:#64748b; padding-top:5px; text-align:right; padding-right:5px;">${minToHhmm(startHour)}</div>
                         <div style="flex:1; display:flex; position:relative;">
                             ${courtCols}${blocksHtml}
                         </div>
                     </div>
                  </div>
                `;
            });
            contentArea.innerHTML = `<div id="print-area-grid">${gridHtml}</div>`;
        }
    }

    let adminControls = '';
    if (isAdmin) {
      adminControls = `
        <div style="width:1px; height:30px; background:#cbd5e1; margin: 0 5px;"></div>
        <button class="btn-outline btn-print-pdf" data-orientation="portrait" style="display:flex; align-items:center; gap:6px;">🖨️ Imprimir (Retrato)</button>
        <button class="btn-outline btn-print-pdf" data-orientation="landscape" style="display:flex; align-items:center; gap:6px;">🖨️ Imprimir (Paisagem)</button>
        <button id="btn-export-word" class="btn-outline" style="display:flex; align-items:center; gap:6px; color:#2563eb; border-color:#93c5fd; background:#eff6ff;">📄 Exportar Word</button>
      `;
    }

    container.innerHTML = `
      <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #cbd5e1;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:15px; flex-wrap: wrap; gap: 10px;">
           <h3 style="margin:0; font-size: 20px; color: #0f172a;">Visão Geral da Agenda</h3>
           <div style="display:flex; gap:10px; align-items:center; flex-wrap: wrap;">
               <div style="background:#f1f5f9; padding:4px; border-radius:6px; display:flex; gap:2px; border:1px solid #cbd5e1;">
                   <button class="btn-view-mode" data-view="list" style="padding:6px 15px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:13px; background:${currentViewMode==='list'?'#fff':'transparent'}; box-shadow:${currentViewMode==='list'?'0 1px 3px rgba(0,0,0,0.1)':'none'}; color:${currentViewMode==='list'?'#0f172a':'#64748b'};">Lista Start-List</button>
                   <button class="btn-view-mode" data-view="grid" style="padding:6px 15px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:13px; background:${currentViewMode==='grid'?'#fff':'transparent'}; box-shadow:${currentViewMode==='grid'?'0 1px 3px rgba(0,0,0,0.1)':'none'}; color:${currentViewMode==='grid'?'#0f172a':'#64748b'};">Grelha Visual</button>
               </div>
               ${adminControls}
           </div>
        </div>
        <div id="schedule-content-area"></div>
      </div>
    `;

    container.querySelectorAll('.btn-view-mode').forEach(btn => {
        btn.addEventListener('click', (e) => {
            container.dataset.view = e.target.dataset.view;
            renderMainTab(container);
        });
    });
    
    container.querySelectorAll('.btn-print-pdf').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const orientation = e.target.dataset.orientation;
            let styleEl = document.getElementById('print-orientation-style');
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'print-orientation-style';
                document.head.appendChild(styleEl);
            }
            styleEl.innerHTML = `@media print { @page { size: A4 ${orientation}; margin: 10mm; } }`;
            setTimeout(() => window.print(), 150);
        });
    });
    
    if (container.querySelector('#btn-export-word')) container.querySelector('#btn-export-word').addEventListener('click', () => {
        if (currentViewMode !== 'list') return alert("A exportação funciona no modo 'Lista Start-List'. Alterne a vista.");
        const area = document.getElementById('print-area-list');
        const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Start List</title><style>table {border-collapse: collapse; width: 100%;} th, td {border: 1px solid black; padding: 5px; text-align: center; font-family: sans-serif; font-size: 11pt;}</style></head><body>";
        const sourceHTML = header + `<h2>Start List - ${escapeHTML(state.competition.nome || state.competition.name || 'Competição')}</h2>` + area.innerHTML + "</body></html>";
        const fileDownload = document.createElement("a");
        document.body.appendChild(fileDownload);
        fileDownload.href = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
        fileDownload.download = `Start_List_Bocha.doc`; fileDownload.click(); document.body.removeChild(fileDownload);
    });

    drawContent();
  }

  loadData();
}