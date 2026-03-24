// client/js/pages/competition-athletes.js

import { db } from '../firebase-config.js';
import { collection, getDocs, getDoc, doc, query, where, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { logAction } from '../logger.js'; 

if (!window.XLSX) {
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    document.head.appendChild(script);
}

const CHECK_ITEMS = [
    { id: 'cadeira', label: 'Cadeira' },
    { id: 'rampa', label: 'Rampa' },
    { id: 'ponteira', label: 'Ponteira' },
    { id: 'comunicacao', label: 'Disp. Comunicação' },
    { id: 'luvas', label: 'Luvas/Talas' }
];

export async function renderCompetitionAthletes(root, hashData) {
  let competitionId = null;
  const auth = getAuth();
  
  if (typeof hashData === 'string' && hashData.includes('?')) {
    const urlParams = new URLSearchParams(hashData.split('?')[1]);
    competitionId = urlParams.get('id');
  } else if (hashData && hashData.competitionId) {
    competitionId = hashData.competitionId;
  } else {
     const match = window.location.hash.match(/id=([a-zA-Z0-9_-]+)/);
     if (match) competitionId = match[1];
  }

  if (!competitionId) {
    root.innerHTML = `<div class="alert alert-danger" style="margin:20px; padding:20px;">Erro: ID da competição ausente.</div>`;
    return;
  }

  const state = {
    competitionName: 'Carregando...',
    athletesByClass: {},
    equipmentChecks: {},
    colorsMap: {},
    officials: [],
    isAdminTotal: false,
    canEditCheck: false,
    clubesCache: [],
    globalMap: {},
    currentTab: 'startlist'
  };

  const API = {
    getCompetition: async (id) => {
      const docRef = doc(db, "competitions", id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      }
      return { name: 'Competição Oficial' };
    },
    getClasses: async (id) => {
      const q = query(collection(db, "draws"), where("competition_id", "==", String(id)));
      const snap = await getDocs(q);
      const classes = [];
      snap.forEach(doc => {
        const data = doc.data();
        if (data.class_code) classes.push({ class_code: data.class_code });
      });
      return classes;
    },
    getDrawData: async (compId, classCode) => {
       const q = query(collection(db, "draws"), 
          where("competition_id", "==", String(compId)), 
          where("class_code", "==", classCode)
       );
       const snap = await getDocs(q);
       if (snap.empty) return [];
       
       const drawDoc = snap.docs[0].data();
       return drawDoc.data || drawDoc.groups || drawDoc.draw_data || [];
    },
    getGlobalColors: async () => {
      const snap = await getDocs(collection(db, "classes"));
      snap.forEach(d => {
        const c = d.data();
        const code = c.codigo || c.code || d.id; 
        state.colorsMap[code] = { bg: c.ui_bg || '#f8f9fa', fg: c.ui_fg || '#212529' };
      });
    },
    getClubes: async () => {
      const snap = await getDocs(collection(db, "clubes"));
      let clubes = [];
      snap.forEach(doc => {
          clubes.push({ id: doc.id, ...doc.data() });
      });
      return clubes.sort((a, b) => (a.nome || a.name || '').localeCompare(b.nome || b.name || ''));
    },
    getEquipmentChecks: async (compId) => {
      const q = query(collection(db, "equipment_checks"), where("competition_id", "==", String(compId)));
      const snap = await getDocs(q);
      const checks = {};
      snap.forEach(doc => {
          const data = doc.data();
          checks[data.athlete_id] = { id: doc.id, ...data };
      });
      return checks;
    },
    getOfficials: async (compId) => {
      const q = query(collection(db, "competition_officials"), where("competition_id", "==", String(compId)));
      const snap = await getDocs(q);
      if (!snap.empty) return snap.docs[0].data().officials || [];
      return [];
    }
  };

  async function loadData() {
    root.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; height: 50vh; flex-direction: column;">
        <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #0d6efd; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <p style="margin-top: 15px; color: #64748b; font-family: sans-serif;">A preparar lista de atletas e equipamentos...</p>
        <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
      </div>
    `;

    onAuthStateChanged(auth, async (user) => {
        let uName = "";
        let uEmail = user?.email || "";

        if (user) {
            try {
                const uDoc = await getDoc(doc(db, "users", user.uid));
                if (uDoc.exists()) {
                    const uData = uDoc.data();
                    uName = uData.nome || uData.name || "";
                    const role = String(uData.global_role || uData.role || '').toUpperCase();
                    if (role.includes('ADMIN_GERAL') || role.includes('ADMINISTRADOR')) state.isAdminTotal = true;
                }
            } catch(e) {}
        }

        try {
          const compData = await API.getCompetition(competitionId);
          state.competitionName = compData.name || compData.nome || 'Competição Oficial';
    
          await API.getGlobalColors();
          state.equipmentChecks = await API.getEquipmentChecks(competitionId);
          state.officials = await API.getOfficials(competitionId);

          let isAuthToEdit = false;
          if (state.isAdminTotal) isAuthToEdit = true;
          if (sessionStorage.getItem('oper_comp_id') === String(competitionId)) isAuthToEdit = true; 

          if (user && state.officials.length > 0 && !isAuthToEdit) {
              const cleanStr = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, '');
              const myCleanName = cleanStr(uName);
              const myCleanEmail = cleanStr(uEmail);

              const myOff = state.officials.find(o => {
                  const oId = String(o.referee_id || o.uid || o.official_id || o.id || '');
                  const oEmailStr = cleanStr(o.email);
                  const oNameStr = cleanStr(o.nome || o.nome_completo || o.nome_abreviado);
                  
                  if (user.uid && oId === String(user.uid)) return true;
                  if (myCleanEmail && oEmailStr && oEmailStr === myCleanEmail) return true;
                  if (myCleanName && oNameStr && (oNameStr === myCleanName || oNameStr.includes(myCleanName))) return true;
                  return false;
              });

              if (myOff) {
                  const role = String(myOff.role || '').toLowerCase();
                  if (role.includes('delegado') || role.includes('chefe') || role.includes('hr') || role.includes('ahr') || role.includes('call room') || role.includes('câmara') || role.includes('camara')) {
                      isAuthToEdit = true;
                  }
              }
          }
          state.canEditCheck = isAuthToEdit;

          const globalAthletesSnap = await getDocs(collection(db, "atletas"));
          const globalTeamsSnap = await getDocs(collection(db, "equipes"));
          
          globalAthletesSnap.forEach(d => {
              const dd = d.data();
              state.globalMap[d.id] = {
                  id: d.id,
                  nome: dd.nome ?? dd.name ?? '',
                  clube_id: dd.clube_id ?? dd.club_id ?? '',
                  clube_nome: dd.clube_nome ?? dd.clube ?? dd['representação/clube'] ?? '',
                  clube_sigla: dd.clube_sigla ?? dd.sigla ?? '',
                  regiao: dd.regiao ?? '',
                  operador_rampa: dd.operador_rampa ?? ''
              };
          });
          globalTeamsSnap.forEach(d => {
              const dd = d.data();
              state.globalMap[d.id] = {
                  id: d.id,
                  nome: dd.nome ?? dd.name ?? '',
                  clube_id: dd.clube_id ?? dd.club_id ?? '',
                  clube_nome: dd.rep_value_name ?? dd.clube_nome ?? dd.clube ?? '', 
                  clube_sigla: dd.club_sigla ?? dd.sigla ?? '',
                  regiao: dd.regiao ?? '',
                  operador_rampa: dd.operador_rampa ?? ''
              };
          });

          const compAthletesRef = collection(db, "competition_athletes");
          const compAthletesSnap = await getDocs(query(compAthletesRef, where("competition_id", "==", String(competitionId))));
          let freshAthletesMap = {};
          compAthletesSnap.forEach(doc => {
              const data = doc.data();
              (data.athletes || []).forEach(a => {
                  freshAthletesMap[String(a.id || a.firebase_id)] = a;
              });
          });
          
          const classes = await API.getClasses(competitionId);
          
          for (const cls of classes) {
             const code = cls.class_code || cls.codigo || cls.name;
             const drawData = await API.getDrawData(competitionId, code);
             
             if (drawData && drawData.length > 0) {
                let athletesInClass = [];
                drawData.forEach(group => {
                   if (group.players) athletesInClass = athletesInClass.concat(group.players);
                });
                
                if (athletesInClass.length > 0) {
                    const uniqueAthletesMap = new Map();
                    athletesInClass.forEach(a => {
                        const trueId = String(a.id || a.firebase_id);
                        if (trueId && trueId !== 'BYE' && trueId !== 'undefined') {
                            const globalData = state.globalMap[trueId] || {};
                            const fresh = freshAthletesMap[trueId] || {};
                            
                            uniqueAthletesMap.set(trueId, {
                                ...a,
                                id: trueId,
                                classCode: code,
                                operador_rampa: globalData.operador_rampa || fresh.operador_rampa || a.operador_rampa || '',
                                clube_id: globalData.clube_id || fresh.clube_id || a.clube_id || '',
                                clube_nome: globalData.clube_nome || fresh.clube_nome || a.clube_nome || '',
                                clube_sigla: globalData.clube_sigla || fresh.clube_sigla || a.clube_sigla || '',
                                regiao: globalData.regiao || fresh.regiao || a.regiao || '',
                                nome: globalData.nome || fresh.nome || a.nome || ''
                            });
                        }
                    });
                    const uniqueAthletes = Array.from(uniqueAthletesMap.values());
                    uniqueAthletes.sort((a, b) => parseInt(a.bib || '999', 10) - parseInt(b.bib || '999', 10));
                    state.athletesByClass[code] = uniqueAthletes;
                }
             }
          }

          if (state.isAdminTotal) {
              state.clubesCache = await API.getClubes();
          }
    
          render();
        } catch (e) {
          console.error(e);
          root.innerHTML = `<div class="alert alert-danger" style="margin:20px; padding:20px;">Erro crítico de ligação ao Firebase: ${e.message}</div>`;
        }
    });
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function downloadExcel() {
      if (!window.XLSX) {
          alert("Biblioteca Excel ainda a carregar. Tente novamente em 2 segundos.");
          return;
      }

      let excelData = [];
      const classCodes = Object.keys(state.athletesByClass).sort();

      classCodes.forEach(code => {
          const athletes = state.athletesByClass[code];
          athletes.forEach(a => {
              excelData.push({
                  "Classe": code,
                  "BIB": a.bib || '-',
                  "Nome do Atleta / Equipa": a.nome || a.name || '',
                  "Operador de Rampa": a.operador_rampa || '',
                  "Nome do Clube": a.clube_nome || '',
                  "Sigla": a.clube_sigla || '',
                  "Região/UF": a.regiao || '',
                  "ID do Sistema": a.id || a.firebase_id || ''
              });
          });
      });

      if (excelData.length === 0) {
          alert("Não há atletas para exportar nesta competição.");
          return;
      }

      const worksheet = window.XLSX.utils.json_to_sheet(excelData);
      const wscols = [
          {wch: 12}, {wch: 8}, {wch: 45}, {wch: 35}, {wch: 45}, {wch: 10}, {wch: 15}, {wch: 25}
      ];
      worksheet['!cols'] = wscols;

      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, worksheet, "Start List");
      
      const safeName = state.competitionName.replace(/[^a-z0-9]/gi, '_');
      const filename = `StartList_${safeName}.xlsx`;
      
      window.XLSX.writeFile(workbook, filename);
  }

  function getGroupedByClub() {
      let allAthletes = [];
      Object.keys(state.athletesByClass).forEach(code => {
          state.athletesByClass[code].forEach(a => allAthletes.push(a));
      });

      let byClub = {};
      allAthletes.forEach(a => {
          const clubName = a.clube_nome || a.clube_sigla || 'Sem Representação';
          if (!byClub[clubName]) byClub[clubName] = [];
          byClub[clubName].push(a);
      });

      Object.keys(byClub).forEach(k => {
          byClub[k].sort((a, b) => {
              if(a.classCode !== b.classCode) return a.classCode.localeCompare(b.classCode);
              return parseInt(a.bib || '999') - parseInt(b.bib || '999');
          });
      });

      return byClub;
  }

  function getHROfficialName() {
      const hrOff = state.officials.find(o => {
          const r = String(o.role || '').toLowerCase();
          return r.includes('chefe') && !r.includes('assistente');
      });
      return hrOff ? escapeHTML(hrOff.nome_completo || hrOff.nome) : '___________________________________';
  }

  // 🔥 IMPRESSÃO DE CHAMADA (PRESENÇAS) - COM NOME DE CLUBE COMPLETO E SEM ASSINATURA 🔥
  function printChamada() {
      const classCodes = Object.keys(state.athletesByClass).sort();
      const printWindow = window.open('', '_blank');
      let html = '';

      classCodes.forEach(code => {
          const athletes = state.athletesByClass[code];
          html += `
              <div style="margin-bottom: 30px; page-break-inside: avoid;">
                  <h3 style="background:#e2e8f0; padding:8px; margin:0; text-transform:uppercase; font-size:12pt; -webkit-print-color-adjust: exact;">Classe ${escapeHTML(code)}</h3>
                  <table style="width:100%; border-collapse:collapse; font-size:10pt;">
                      <thead>
                          <tr>
                              <th style="border:1px solid #000; padding:6px; width:50px;">BIB</th>
                              <th style="border:1px solid #000; padding:6px; text-align:left;">Nome do Atleta</th>
                              <th style="border:1px solid #000; padding:6px; text-align:left;">Clube</th>
                              <th style="border:1px solid #000; padding:6px; width:80px;">Presença</th>
                          </tr>
                      </thead>
                      <tbody>
          `;
          athletes.forEach(a => {
              html += `
                  <tr>
                      <td style="border:1px solid #000; padding:8px; font-weight:bold; font-size:12pt; text-align:center;">${escapeHTML(a.bib)}</td>
                      <td style="border:1px solid #000; padding:8px; text-align:left;">${escapeHTML(a.nome)}</td>
                      <td style="border:1px solid #000; padding:8px; text-align:left;">${escapeHTML(a.clube_nome || a.clube_sigla)}</td>
                      <td style="border:1px solid #000; padding:8px; text-align:center;"><div style="width:20px; height:20px; border:2px solid #000; margin:0 auto;"></div></td>
                  </tr>
              `;
          });
          html += `</tbody></table></div>`;
      });

      printWindow.document.write(`
          <html>
          <head>
              <title>Lista de Presença / Chamada</title>
              <style>
                  body { font-family: Arial, sans-serif; margin: 20px; color: #000; }
                  h2 { text-align: center; font-size: 14pt; margin: 0 0 5px 0; text-transform: uppercase; }
                  h3.sub { text-align: center; font-size: 11pt; margin: 0 0 20px 0; font-weight: normal;}
              </style>
          </head>
          <body>
              <h2>Associação Nacional de Desporto para Deficientes</h2>
              <h3 class="sub">Lista de Presença / Chamada - ${escapeHTML(state.competitionName)}</h3>
              ${html}
              <script>
                  window.onload = function() { 
                      window.print();
                      setTimeout(function(){ window.close(); }, 500);
                  }
              </script>
          </body>
          </html>
      `);
      printWindow.document.close();
  }

  // IMPRESSÃO DE CHECAGEM COM LINHAS EXTRAS (CAIXA DIRETO NO MENU)
  function printChecagem() {
      const extraRows = parseInt(document.getElementById('input-extra-rows')?.value) || 0;
      const byClub = getGroupedByClub();
      const clubNames = Object.keys(byClub).sort();
      const onlyObs = document.getElementById('chk-only-obs')?.checked;
      const hrName = getHROfficialName();
      
      const printWindow = window.open('', '_blank');
      let htmlTabela = '';

      clubNames.forEach(clubName => {
          let athletesToPrint = byClub[clubName];
          
          if (onlyObs) {
              athletesToPrint = athletesToPrint.filter(a => {
                  const chk = state.equipmentChecks[a.id] || {};
                  return chk.obs && chk.obs.trim() !== '';
              });
          }
          
          if (athletesToPrint.length === 0) return; 

          htmlTabela += `<tr><td colspan="7" class="club-header">${escapeHTML(clubName)}</td></tr>`;
          
          athletesToPrint.forEach(a => {
              const chk = state.equipmentChecks[a.id] || {};
              const getVal = (key) => {
                  if (chk[key] === 'OK') return 'OK';
                  if (chk[key] === 'X') return 'X';
                  return '';
              };

              const rampaStr = a.operador_rampa ? `<br><small style="color:#555;">Op: ${escapeHTML(a.operador_rampa)}</small>` : '';

              htmlTabela += `
                  <tr>
                      <td rowspan="6" style="font-weight:bold; font-size:12pt; vertical-align:middle;">${escapeHTML(a.bib)}</td>
                      <td rowspan="6" class="text-left" style="vertical-align:middle;"><strong>${escapeHTML(a.nome)}</strong>${rampaStr}</td>
                      <td rowspan="6" class="text-left" style="font-size:8pt; vertical-align:middle;">${escapeHTML(a.clube_sigla || a.clube_nome)}</td>
                      <td rowspan="6" style="vertical-align:middle;"><strong>${escapeHTML(a.classCode)}</strong></td>
                      
                      <td class="text-left">Cadeira</td>
                      <td>${getVal('cadeira')}</td>
                      <td rowspan="6" style="vertical-align:bottom; padding-bottom:5px;">${escapeHTML(chk.responsavel || '')}</td>
                  </tr>
                  <tr><td class="text-left">Rampa</td><td>${getVal('rampa')}</td></tr>
                  <tr><td class="text-left">Ponteira</td><td>${getVal('ponteira')}</td></tr>
                  <tr><td class="text-left">Disp. Com.</td><td>${getVal('comunicacao')}</td></tr>
                  <tr><td class="text-left">Luvas/Talas</td><td>${getVal('luvas')}</td></tr>
                  <tr><td colspan="2" class="text-left" style="height:25px; vertical-align:top; font-size:8pt;"><strong>Obs:</strong> ${escapeHTML(chk.obs || '')}</td></tr>
              `;
          });
      });

      // ADIÇÃO DE LINHAS EXTRAS EM BRANCO
      if (extraRows > 0) {
          htmlTabela += `<tr><td colspan="7" class="club-header">ATLETAS A CLASSIFICAR / EXTRAS</td></tr>`;
          for (let i = 0; i < extraRows; i++) {
              htmlTabela += `
                  <tr>
                      <td rowspan="6" style="vertical-align:middle; width:40px;"></td>
                      <td rowspan="6" class="text-left" style="vertical-align:middle;"></td>
                      <td rowspan="6" class="text-left" style="font-size:8pt; vertical-align:middle;"></td>
                      <td rowspan="6" style="vertical-align:middle; width:40px;"></td>
                      
                      <td class="text-left">Cadeira</td>
                      <td></td>
                      <td rowspan="6" style="vertical-align:bottom; padding-bottom:5px;"></td>
                  </tr>
                  <tr><td class="text-left">Rampa</td><td></td></tr>
                  <tr><td class="text-left">Ponteira</td><td></td></tr>
                  <tr><td class="text-left">Disp. Com.</td><td></td></tr>
                  <tr><td class="text-left">Luvas/Talas</td><td></td></tr>
                  <tr><td colspan="2" class="text-left" style="height:25px; vertical-align:top; font-size:8pt;"><strong>Obs:</strong> </td></tr>
              `;
          }
      }

      if (htmlTabela === '') {
          printWindow.close();
          alert("Nenhum atleta listado possui observações registradas na checagem.");
          return;
      }

      printWindow.document.write(`
          <html>
          <head>
              <title>Folha para Checagem de Equipamentos</title>
              <style>
                  body { font-family: Arial, sans-serif; margin: 15px; color: #000; }
                  .header { text-align: center; margin-bottom: 15px; }
                  .header h2 { margin: 0; font-size: 14pt; text-transform: uppercase; }
                  .header h3 { margin: 5px 0 10px 0; font-size: 11pt; font-weight: normal; }
                  table { width: 100%; border-collapse: collapse; font-size: 9pt; line-height: 1.1; }
                  th, td { border: 1px solid #000; padding: 3px 5px; text-align: center; }
                  th { background-color: #e2e8f0; -webkit-print-color-adjust: exact; }
                  .text-left { text-align: left; }
                  .club-header { background-color: #cbd5e1; font-weight: bold; font-size: 10pt; text-align: left; -webkit-print-color-adjust: exact; }
                  tr { page-break-inside: avoid; }
              </style>
          </head>
          <body>
              <div class="header">
                  <h2>Associação Nacional de Desporto para Deficientes</h2>
                  <h3>Folha para Checagem de Equipamentos - ${escapeHTML(state.competitionName)}</h3>
                  <div style="display:flex; justify-content:space-between; font-size:9pt;">
                      <div style="text-align:left;"><strong>Data:</strong> ____/____/________</div>
                      <div style="text-align:right;"></div>
                  </div>
              </div>
              <table>
                  <thead>
                      <tr>
                          <th style="width:30px;">#</th>
                          <th>Nome</th>
                          <th>Clube</th>
                          <th style="width:40px;">Classe</th>
                          <th style="width:110px;">Equipamentos</th>
                          <th style="width:50px;">Check</th>
                          <th style="width:130px;">Responsável</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${htmlTabela}
                  </tbody>
              </table>
              <div style="margin-top: 50px; text-align: right; margin-right: 50px;">
                  <div style="display: inline-block; text-align: center; min-width: 250px;">
                      <div style="border-top: 1px solid #000; padding-top: 5px;">
                          <strong style="font-size: 11pt;">${hrName}</strong><br>
                          <span style="font-size: 10pt; font-weight: normal;">Árbitro Chefe</span>
                      </div>
                  </div>
              </div>
              <script>
                  window.onload = function() { 
                      window.print();
                      setTimeout(function(){ window.close(); }, 500);
                  }
              </script>
          </body>
          </html>
      `);
      printWindow.document.close();
  }

  // IMPRESSÃO DE CLASSIFICAÇÃO COM LINHAS EXTRAS
  function printClassificacao() {
      const extraRows = parseInt(document.getElementById('input-extra-rows')?.value) || 0;
      const printWindow = window.open('', '_blank');
      let rowsHtml = '';
      let count = 0;
      const hrName = getHROfficialName();

      const allAthletes = [];
      Object.values(state.athletesByClass).forEach(list => list.forEach(a => allAthletes.push(a)));

      allAthletes.sort((a,b) => (a.nome || '').localeCompare(b.nome || ''));

      allAthletes.forEach(a => {
          const chk = state.equipmentChecks[a.id];
          if (chk && chk.classificacao === 'Sim') {
              count++;
              rowsHtml += `
                  <tr>
                      <td style="text-align:center; padding: 12px 8px; font-weight:bold;">${escapeHTML(a.bib)}</td>
                      <td class="text-left" style="padding: 12px 8px;"><strong>${escapeHTML(a.nome)}</strong></td>
                      <td class="text-left" style="padding: 12px 8px;">${escapeHTML(a.clube_nome)}</td>
                      <td class="text-left" style="padding: 12px 8px;">${escapeHTML(chk.equipamento_obs)}</td>
                      <td style="text-align:center; padding: 12px 8px; font-weight:bold;">Sim</td>
                  </tr>
              `;
          }
      });

      const totalRows = Math.max(count + extraRows, 12);
      for(let i = count; i < totalRows; i++) {
          rowsHtml += `<tr><td style="padding: 15px;"></td><td></td><td></td><td></td><td></td></tr>`;
      }

      printWindow.document.write(`
          <html>
          <head>
              <title>Anotações - Classificação</title>
              <style>
                  body { font-family: Arial, sans-serif; margin: 30px; color: #000; }
                  h2 { text-align: center; font-size: 14pt; margin: 0 0 10px 0; text-transform: uppercase; }
                  h3 { text-align: center; font-size: 12pt; margin: 0 0 20px 0; font-weight: normal;}
                  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
                  th, td { border: 1px solid #000; padding: 8px; }
                  th { background-color: #e2e8f0; -webkit-print-color-adjust: exact; text-align: center;}
                  .text-left { text-align: left; }
              </style>
          </head>
          <body>
              <h2>Associação Nacional de Desporto para Deficientes</h2>
              <h3>Anotações na CHECAGEM DE EQUIPAMENTOS para verificar com a classificação</h3>
              
              <table>
                  <thead>
                      <tr>
                          <th style="width:10%;">BIB</th>
                          <th style="width:30%;">NOME DO ATLETA</th>
                          <th style="width:20%;">CLUBE</th>
                          <th style="width:25%;">EQUIPAMENTO OBSERVADO A SER CONFIRMADO</th>
                          <th style="width:15%;">CLASSIFICAÇÃO?</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${rowsHtml}
                  </tbody>
              </table>
              <div style="margin-top: 50px; text-align: right; margin-right: 50px;">
                  <div style="display: inline-block; text-align: center; min-width: 250px;">
                      <div style="border-top: 1px solid #000; padding-top: 5px;">
                          <strong style="font-size: 11pt;">${hrName}</strong><br>
                          <span style="font-size: 10pt; font-weight: normal;">Árbitro Chefe</span>
                      </div>
                  </div>
              </div>
              <script>
                  window.onload = function() { 
                      window.print(); 
                      setTimeout(function(){ window.close(); }, 500); 
                  }
              </script>
          </body>
          </html>
      `);
      printWindow.document.close();
  }

  function render() {
    const classCodes = Object.keys(state.athletesByClass).sort();
    let startListHtml = '';

    if (classCodes.length === 0) {
      startListHtml = `
        <div style="text-align:center; padding: 60px; background: #fff; border-radius: 8px; border: 1px dashed #cbd5e1; margin-top: 20px;">
           <div style="font-size: 40px; margin-bottom: 10px;">📋</div>
           <h3 style="color: #475569; margin: 0;">Nenhum Atleta Oficializado</h3>
           <p style="color: #94a3b8; font-size: 14px; margin-top: 5px;">A relação de atletas só é construída após o sorteio das chaves no Painel da Classe.</p>
        </div>
      `;
    } else {
      startListHtml = classCodes.map(code => {
        const athletes = state.athletesByClass[code];
        const colors = state.colorsMap[code] || { bg: '#0f172a', fg: '#ffffff' };
        
        return `
          <div class="print-break-inside-avoid" style="margin-bottom: 30px; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04); border: 1px solid #cbd5e1;">
            <div style="background-color: ${colors.bg}; color: ${colors.fg}; padding: 10px 20px; display: flex; align-items: center; justify-content: space-between;" class="force-print-color">
                <h2 style="margin: 0; font-size: 16px; font-weight: 700; text-transform: uppercase;">Classe ${escapeHTML(code)}</h2>
                <span style="font-size: 12px; font-weight: bold; background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 12px;">
                    ${athletes.length} Inscritos
                </span>
            </div>
            
            <div style="overflow-x: auto; padding: 15px;">
              <table class="wb-table" style="width: 100%;">
                <thead>
                  <tr class="force-print-color">
                    <th style="width: 80px; text-align: center;">BIB</th>
                    <th style="width: 50%;">Atleta / Equipa</th>
                    <th>Clube / Delegação</th>
                    ${state.isAdminTotal ? `<th style="width: 60px; text-align: center;" class="no-print">Editar</th>` : ''}
                  </tr>
                </thead>
                <tbody>
                  ${athletes.map(a => `
                    <tr>
                      <td style="text-align: center;">
                        <div class="wb-bib-badge force-print-color">
                            ${escapeHTML(a.bib)}
                        </div>
                      </td>
                      <td style="color: #1e293b;">
                        <span style="font-weight: 600;">${escapeHTML(a.nome || a.name)}</span>
                        ${a.operador_rampa ? `<span style="font-size: 13px; font-style: italic; color: #64748b; margin-left: 5px;">/ ${escapeHTML(a.operador_rampa)}</span>` : ''}
                      </td>
                      <td style="color: #475569;">
                        ${escapeHTML(a.clube_nome)} ${a.clube_sigla && a.clube_sigla !== a.clube_nome ? `<strong>(${escapeHTML(a.clube_sigla)})</strong>` : ''}
                      </td>
                      ${state.isAdminTotal ? `
                      <td style="text-align: center;" class="no-print">
                        <button class="btn-edit-ath" data-id="${a.id || a.firebase_id}" data-class="${code}" style="background:transparent; border:none; cursor:pointer; font-size:16px;" title="Edição Profunda do Atleta">✏️</button>
                      </td>` : ''}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }).join('');
    }

    const byClub = getGroupedByClub();
    const clubNames = Object.keys(byClub).sort();
    
    let checagemHtml = '';
    if (clubNames.length === 0) {
        checagemHtml = `<p style="text-align:center; padding:40px; color:#64748b;">Nenhum atleta listado.</p>`;
    } else {
        checagemHtml = clubNames.map(clubName => {
            const athletes = byClub[clubName];
            return `
              <div style="margin-bottom: 25px; background: white; border-radius: 8px; border: 1px solid #cbd5e1; overflow:hidden;">
                  <div style="background: #e2e8f0; color: #0f172a; font-weight: bold; padding: 12px 20px; font-size: 15px; border-bottom: 1px solid #cbd5e1;">
                      ${escapeHTML(clubName)}
                  </div>
                  <div style="padding: 0;">
                      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                          <tbody>
                              ${athletes.map(a => {
                                  const chk = state.equipmentChecks[a.id];
                                  const isLocked = chk && chk.locked; 
                                  const hasData = chk && chk.responsavel;
                                  const isPresent = chk && chk.presenca;
                                  
                                  const bibBg = isPresent ? '#22c55e' : '#eff6ff';
                                  const bibColor = isPresent ? 'white' : '#2563eb';
                                  const bibBorder = isPresent ? '#16a34a' : '#bfdbfe';

                                  let statusBadge = `<span style="background:#f1f5f9; color:#64748b; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:bold;">Pendente</span>`;
                                  let btnStyle = state.canEditCheck ? "background:#16a34a; color:white;" : "background:#64748b; color:white;";
                                  let btnText = state.canEditCheck ? "✅ Preencher" : "👁️ Visualizar";

                                  if (isLocked) {
                                      statusBadge = `<span style="background:#fefce8; color:#a16207; border:1px solid #fde047; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:bold;">🔒 Finalizado</span>`;
                                      if (state.canEditCheck) {
                                          btnStyle = "background:#f59e0b; color:white;";
                                          btnText = "✏️ Editar";
                                      }
                                  } else if (hasData) {
                                      statusBadge = `<span style="background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:bold;">⏳ Rascunho</span>`;
                                  }

                                  return `
                                  <tr style="border-bottom: 1px solid #f1f5f9;">
                                      <td style="padding: 12px 20px; width: 60px; text-align: center;">
                                          <div id="bib-badge-${a.id}" style="background:${bibBg}; color:${bibColor}; border:1px solid ${bibBorder}; font-weight:bold; padding:4px; border-radius:4px; font-size:12px; transition:0.3s;">${escapeHTML(a.bib)}</div>
                                      </td>
                                      <td style="padding: 12px 20px;">
                                          <div style="font-weight: 600; color: #1e293b;">${escapeHTML(a.nome)}</div>
                                          <div style="font-size: 12px; color: #64748b; margin-top:2px;">Classe: <strong style="color:#2563eb;">${escapeHTML(a.classCode)}</strong> ${a.operador_rampa ? ` | Op: ${escapeHTML(a.operador_rampa)}` : ''}</div>
                                      </td>
                                      <td style="padding: 12px 20px; text-align: center; width:100px;">
                                          ${statusBadge}
                                      </td>
                                      <td style="padding: 12px 20px; text-align: right; width:220px;">
                                          <div style="display:flex; gap:15px; align-items:center; justify-content:flex-end;">
                                              <label style="display:flex; align-items:center; gap:5px; font-size:12px; font-weight:bold; color:#475569; cursor:pointer;">
                                                  <input type="checkbox" class="chk-presenca" data-id="${a.id}" ${isPresent ? 'checked' : ''} ${!state.canEditCheck ? 'disabled' : ''} style="transform:scale(1.2);"> Presença
                                              </label>
                                              <button class="btn-abrir-chk" data-id="${a.id}" data-name="${escapeHTML(a.nome)}" data-class="${a.classCode}" data-bib="${a.bib}" style="${btnStyle} border:none; padding:8px 12px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px; transition:0.2s;">${btnText}</button>
                                          </div>
                                      </td>
                                  </tr>
                              `}).join('')}
                          </tbody>
                      </table>
                  </div>
              </div>
            `;
        }).join('');
    }

    const oficiaisDisponiveis = state.officials.filter(o => {
        const role = String(o.role || '').toLowerCase();
        return !role.includes('delegado') && !role.includes('chefe') && !role.includes('hr');
    });

    let oficiaisOptions = `<option value="">-- Selecione o Árbitro --</option>`;
    oficiaisDisponiveis.forEach(o => {
        const nome = escapeHTML(o.nome_completo || o.nome);
        oficiaisOptions += `<option value="${nome}">${nome}</option>`;
    });

    const styles = `
      <style>
        .wb-container { max-width: 1000px; margin: 0 auto; padding: 20px; font-family: sans-serif; }
        .wb-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
        
        .wb-table { border-collapse: collapse; font-size: 14px; border: 1px solid #e2e8f0; }
        .wb-table th { background: #f8fafc; color: #475569; font-weight: 600; text-transform: uppercase; font-size: 12px; padding: 10px 15px; text-align: left; border: 1px solid #e2e8f0; }
        .wb-table td { padding: 8px 15px; border: 1px solid #e2e8f0; vertical-align: middle; }
        .wb-table tr:hover { background-color: #f8fafc; }
        
        .wb-bib-badge { background: #eff6ff; color: #2563eb; width: 40px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 6px; font-weight: bold; margin: 0 auto; border: 1px solid #bfdbfe; font-size: 13px; }

        .btn-outline-secondary { border: 1px solid #cbd5e1; background: white; color: #475569; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500; transition: all 0.2s; }
        .btn-outline-secondary:hover { background: #f1f5f9; color: #0f172a; }
        
        .btn-primary-print { background: #0d6efd; border: 1px solid #0b5ed7; color: white; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; transition: background 0.2s; display: flex; align-items: center; gap: 8px; }
        .btn-primary-print:hover { background: #0b5ed7; }

        .btn-excel { background: #16a34a; border: 1px solid #15803d; color: white; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; transition: background 0.2s; display: flex; align-items: center; gap: 8px; }
        .btn-excel:hover { background: #15803d; }

        .tab-btn { padding: 12px 20px; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; background: #e2e8f0; color: #475569; transition: 0.2s; white-space: nowrap; font-size:14px; }
        .tab-btn.active { background: #2563eb; color: white; }

        .btn-abrir-chk:hover { filter: brightness(0.9); }

        .modal-chk { border: none; border-radius: 12px; padding: 0; box-shadow: 0 20px 40px rgba(0,0,0,0.5); width: 650px; max-width: 95vw; font-family: sans-serif; background: #f8fafc; }
        .chk-header { background: #0f172a; color: white; padding: 20px; border-radius: 12px 12px 0 0; display:flex; justify-content:space-between; align-items:center; }
        .chk-body { padding: 20px; max-height: 65vh; overflow-y: auto; }
        .chk-footer { padding: 15px 20px; background: white; border-top: 1px solid #e2e8f0; border-radius: 0 0 12px 12px; display:flex; justify-content:flex-end; gap:10px; }
        
        .chk-row { display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid #e2e8f0; }
        .chk-row:last-child { border-bottom: none; }
        .chk-label { font-weight: bold; color: #334155; font-size: 14px; }
        .chk-radios { display:flex; gap: 5px; }
        .chk-radios label { background: white; border: 1px solid #cbd5e1; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer; color: #475569; transition: 0.2s; }
        .chk-radios label:hover { background: #f1f5f9; }
        .chk-radios input[type="radio"] { display: none; }
        .chk-radios input[value="OK"]:checked + label { background: #dcfce7; color: #166534; border-color: #22c55e; }
        .chk-radios input[value="X"]:checked + label { background: #fef2f2; color: #991b1b; border-color: #ef4444; }
        
        /* Estilo visual para input desabilitado */
        .chk-radios input[type="radio"]:disabled + label { opacity: 0.5; cursor: not-allowed; background:#f1f5f9; border-color:#cbd5e1; color:#94a3b8; }

        .modal-cascade { border: none; border-radius: 12px; padding: 25px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); width: 480px; max-width: 95vw; font-family: sans-serif; }
        .modal-cascade h3 { margin-top: 0; color: #dc2626; border-bottom: 2px solid #fecaca; padding-bottom: 10px; display:flex; align-items:center; gap:8px;}
        .modal-cascade label { font-size: 12px; font-weight: bold; color: #475569; margin-top: 10px; display: block; }
        .modal-cascade input, .modal-cascade select { width: 100%; padding: 10px; margin-top: 4px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
        .modal-cascade .alert-box { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; padding: 10px; border-radius: 6px; font-size: 12px; margin-bottom: 15px; font-weight: 500;}

        .btn-action-small { background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; transition: 0.2s; }
        .btn-action-small:hover { background: #e2e8f0; color: #0f172a; }

        @media print {
          @page { size: A4; margin: 1cm !important; }
          header, nav, .no-print { display: none !important; }
          body, html { background-color: #fff !important; font-size: 10pt !important; padding: 0 !important; }
          .wb-container { max-width: 100% !important; padding: 0 !important; }
          .force-print-color { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          
          .print-break-inside-avoid { 
            page-break-inside: avoid !important; 
            break-inside: avoid !important; 
            box-shadow: none !important; 
            margin-bottom: 25px !important; 
            border: 1px solid #cbd5e1 !important; 
          }
          
          h1 { font-size: 16pt !important; color: #000 !important; }
          .wb-header { border-bottom: 2px solid #000; margin-bottom: 20px !important; padding-bottom: 10px !important; }
          
          .wb-table { font-size: 10pt !important; }
          .wb-table th { font-size: 9pt !important; padding: 8px 10px !important; color: #000 !important; background: #eee !important; border: 1px solid #ccc !important; }
          .wb-table td { padding: 8px 10px !important; border: 1px solid #ccc !important; }
          .wb-bib-badge { width: 32px !important; height: 22px !important; font-size: 9pt !important; background: #fff !important; border: 1px solid #000 !important; color: #000 !important;}
          
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
        }
      </style>
    `;

    root.innerHTML = `
      ${styles}
      <div class="wb-container">
        <div class="wb-header no-print">
          <div>
            <h1 style="margin: 0; font-size: 26px; color: #0f172a;">Relação de Atletas & Call Room</h1>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px;">${escapeHTML(state.competitionName)}</p>
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn-outline-secondary" onclick="window.history.back()">← Voltar</button>
          </div>
        </div>

        <div class="tabs-container no-print" style="display: flex; gap: 10px; margin-bottom: 25px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px;">
            <button id="tab-startlist" class="tab-btn active">📋 Start List Oficial</button>
            <button id="tab-checagem" class="tab-btn">🏓 Call Room / Checagem de Equipamentos</button>
        </div>

        <div id="panel-startlist">
            <div class="no-print" style="display:flex; justify-content:flex-end; gap:10px; margin-bottom:15px;">
                <button class="btn-excel" id="btn-export-excel">⬇️ Exportar Excel</button>
                <button class="btn-primary-print" onclick="window.print()">🖨️ Imprimir Start List</button>
            </div>
            ${startListHtml}
        </div>

        <div id="panel-checagem" style="display:none;">
            <div class="no-print" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; background:#eff6ff; padding:15px; border-radius:8px; border:1px solid #bfdbfe;">
                <div>
                    <h3 style="margin:0; color:#1e3a8a;">Controle de Equipamentos e Classificação</h3>
                    <p style="margin:5px 0 0 0; font-size:13px; color:#3b82f6;">Preencha digitalmente ou imprima as fichas. Marque as presenças diretamente na lista.</p>
                </div>
                <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end; align-items:center;">
                    <label style="cursor:pointer; display:flex; align-items:center; gap:6px; font-weight:bold; color:#1e3a8a; font-size:13px; background:rgba(255,255,255,0.5); padding:8px 12px; border-radius:6px; border:1px solid #bfdbfe;">
                        <input type="checkbox" id="chk-only-obs" style="transform:scale(1.2);">
                        Apenas c/ Observações
                    </label>
                    <label style="display:flex; align-items:center; gap:6px; font-weight:bold; color:#1e3a8a; font-size:13px; background:rgba(255,255,255,0.5); padding:8px 12px; border-radius:6px; border:1px solid #bfdbfe;">
                        Linhas Extras: 
                        <input type="number" id="input-extra-rows" value="2" min="0" max="30" style="width:40px; padding:4px; border:1px solid #bfdbfe; border-radius:4px; text-align:center; font-weight:bold; color:#1e3a8a; background:white; outline:none;">
                    </label>
                    <button id="btn-print-chamada" style="background:#0d9488; color:white; border:none; padding:10px 15px; border-radius:6px; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:8px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                        🖨️ Imprimir Lista de Presença
                    </button>
                    <button id="btn-print-classificacao" style="background:#eab308; color:white; border:none; padding:10px 15px; border-radius:6px; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:8px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                        🖨️ Imprimir p/ Classificação
                    </button>
                    <button id="btn-print-checagem" style="background:#1e40af; color:white; border:none; padding:10px 15px; border-radius:6px; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:8px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                        🖨️ Imprimir Checagem Geral
                    </button>
                </div>
            </div>
            ${checagemHtml}
        </div>
      </div>

      <dialog id="dlg-checagem" class="modal-chk">
          <div class="chk-header">
              <div>
                  <div id="chk-ath-name" style="font-size:18px; font-weight:bold;">Nome do Atleta</div>
                  <div style="font-size:12px; color:#94a3b8; margin-top:2px;">
                      BIB: <span id="chk-ath-bib" style="color:white; font-weight:bold;">000</span> | 
                      Classe: <span id="chk-ath-class" style="color:white; font-weight:bold;">XX</span>
                  </div>
              </div>
              <button type="button" onclick="this.closest('dialog').close()" style="background:transparent; border:none; color:white; font-size:24px; cursor:pointer;">&times;</button>
          </div>
          
          <div class="chk-body">
              <input type="hidden" id="chk-ath-id">

              <div style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; padding: 12px; border-radius: 8px; font-size: 12px; margin-bottom: 20px; line-height: 1.4;">
                  <strong style="font-size:13px; display:block; margin-bottom:4px;">ℹ️ Legenda de Preenchimento:</strong>
                  <strong style="color:#166534;">✅ OK:</strong> Equipamento verificado e aprovado.<br>
                  <strong style="color:#991b1b;">❌ Não possui:</strong> Atleta não possui ou equipamento foi reprovado.<br>
                  <strong style="color:#475569;">Branco:</strong> Ainda não verificado ou não aplicável (Ex: Cadeira para atletas BC3).
              </div>

              <div style="background:white; border:1px solid #e2e8f0; border-radius:8px; padding:0 15px;">
                  ${CHECK_ITEMS.map(item => `
                      <div class="chk-row">
                          <span class="chk-label">${item.label}</span>
                          <div class="chk-radios" id="radios-${item.id}">
                              <input type="radio" id="r_${item.id}_ok" name="chk_${item.id}" value="OK">
                              <label for="r_${item.id}_ok">✅ OK</label>
                              
                              <input type="radio" id="r_${item.id}_x" name="chk_${item.id}" value="X">
                              <label for="r_${item.id}_x">❌ Não possui</label>
                              
                              <input type="radio" id="r_${item.id}_empty" name="chk_${item.id}" value="" checked>
                              <label for="r_${item.id}_empty" style="background:#f8fafc; color:#94a3b8; border-style:dashed;">Branco</label>
                          </div>
                      </div>
                  `).join('')}
              </div>

              <div style="margin-top:15px;">
                  <label style="display:block; font-weight:bold; font-size:13px; color:#475569; margin-bottom:5px;">Observações Gerais:</label>
                  <textarea id="chk_obs" rows="2" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; font-family:sans-serif; resize:none; box-sizing:border-box;"></textarea>
              </div>

              <div style="margin-top:20px; background:#fffbeb; border:1px solid #fde68a; padding:15px; border-radius:8px;">
                  <label style="display:block; font-weight:bold; font-size:14px; color:#b45309; margin-bottom:10px;">📋 Encaminhar para Classificação?</label>
                  
                  <div style="display:flex; gap:15px; margin-bottom:15px;">
                      <label style="cursor:pointer; display:flex; align-items:center; gap:5px; font-weight:bold; color:#16a34a;">
                          <input type="radio" name="chk_classificacao" value="Sim" style="transform:scale(1.2);"> Sim
                      </label>
                      <label style="cursor:pointer; display:flex; align-items:center; gap:5px; font-weight:bold; color:#475569;">
                          <input type="radio" name="chk_classificacao" value="Não" checked style="transform:scale(1.2);"> Não
                      </label>
                  </div>

                  <label style="display:block; font-weight:bold; font-size:13px; color:#b45309; margin-bottom:5px;">Equipamento observado a ser confirmado:</label>
                  <input type="text" id="chk_equip_obs" placeholder="Descreva os itens..." style="width:100%; padding:10px; border:1px solid #fde047; border-radius:6px; font-family:sans-serif; box-sizing:border-box; background:white;">
              </div>

              <div style="margin-top:20px; border-top:1px solid #e2e8f0; padding-top:15px;">
                  <label style="display:block; font-weight:bold; font-size:13px; color:#475569; margin-bottom:5px;">Responsável Pela Checagem (Árbitro):</label>
                  <select id="chk_resp" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; font-family:sans-serif; box-sizing:border-box; background:white;">
                      ${oficiaisOptions}
                  </select>
              </div>
          </div>

          <div class="chk-footer">
              <button type="button" onclick="this.closest('dialog').close()" style="background:transparent; border:1px solid #94a3b8; color:#475569; padding:10px 15px; border-radius:6px; font-weight:bold; cursor:pointer;">Cancelar</button>
              <button type="button" id="btn-save-chk" style="background:#2563eb; color:white; border:none; padding:10px 20px; border-radius:6px; font-weight:bold; cursor:pointer;">💾 Guardar Rascunho</button>
              <button type="button" id="btn-lock-chk" style="background:#f59e0b; color:white; border:none; padding:10px 20px; border-radius:6px; font-weight:bold; cursor:pointer;">✅ Finalizar Checagem</button>
          </div>
      </dialog>

      <dialog id="modal-cascade-edit" class="modal-cascade">
         <div style="display:flex; justify-content:space-between; align-items:flex-start;">
             <h3>⚠️ Edição Profunda</h3>
             <div style="display:flex; gap:5px;">
                 <button type="button" id="btn-clear-fields" class="btn-action-small" title="Apaga o texto de todas as caixas abaixo">🧹 Limpar</button>
                 <button type="button" id="btn-undo-fields" class="btn-action-small" title="Desfazer e voltar aos dados iniciais" style="color:#2563eb; border-color:#bfdbfe; background:#eff6ff;">↺ Undo</button>
             </div>
         </div>
         
         <div class="alert-box">
             Qualquer alteração feita aqui reescreverá os dados deste atleta em <strong>todos os sorteios e jogos (Grupos e KOs)</strong>.
         </div>
         
         <input type="hidden" id="edit-ath-id">
         <input type="hidden" id="edit-ath-class">
         
         <label>Nome Completo do Atleta/Equipa:</label>
         <input type="text" id="edit-ath-name" placeholder="Ex: João Silva">
         
         <label style="color:#0f172a;">Operador de Rampa / Calheiro (Opcional):</label>
         <input type="text" id="edit-ath-rampa" placeholder="Ex: Maria Souza" style="border-color:#94a3b8;">

         <div style="background: #f8fafc; border: 1px dashed #cbd5e1; padding: 12px; border-radius: 8px; margin-top: 15px;">
             <label style="margin-top:0; color:#2563eb;">Selecione o Clube da Base de Dados (Opcional):</label>
             <select id="edit-ath-club-dropdown" style="border-color:#bfdbfe; background:#fff;"></select>

             <label style="margin-top:12px;">Nome do Clube Completo:</label>
             <input type="text" id="edit-ath-club" placeholder="Ex: Associação Desportiva">
             
             <div style="display:flex; gap:10px;">
                 <div style="flex:1;">
                     <label>Sigla do Clube:</label>
                     <input type="text" id="edit-ath-sigla" placeholder="Ex: AD">
                 </div>
                 <div style="flex:1;">
                     <label>Região / UF:</label>
                     <input type="text" id="edit-ath-regiao" placeholder="Ex: SP">
                 </div>
             </div>
         </div>

         <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
             <button type="button" id="btn-cancel-edit" style="background: transparent; border: 1px solid #94a3b8; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-weight: bold; color: #475569;">Cancelar</button>
             <button type="button" id="btn-confirm-edit" style="background: #dc2626; color: white; border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-weight: bold;">Salvar e Reescrever Tudo</button>
         </div>
      </dialog>
    `;

    const applyTab = () => {
        const btnStart = document.getElementById('tab-startlist');
        const btnCheck = document.getElementById('tab-checagem');
        const panelStart = document.getElementById('panel-startlist');
        const panelCheck = document.getElementById('panel-checagem');
        
        if (state.currentTab === 'checagem') {
            btnCheck.classList.add('active'); btnCheck.style.background = '#2563eb'; btnCheck.style.color = 'white';
            btnStart.classList.remove('active'); btnStart.style.background = '#e2e8f0'; btnStart.style.color = '#475569';
            panelCheck.style.display = 'block'; panelStart.style.display = 'none';
        } else {
            btnStart.classList.add('active'); btnStart.style.background = '#2563eb'; btnStart.style.color = 'white';
            btnCheck.classList.remove('active'); btnCheck.style.background = '#e2e8f0'; btnCheck.style.color = '#475569';
            panelStart.style.display = 'block'; panelCheck.style.display = 'none';
        }
    };
    applyTab();

    document.getElementById('tab-startlist').addEventListener('click', () => { state.currentTab = 'startlist'; applyTab(); });
    document.getElementById('tab-checagem').addEventListener('click', () => { state.currentTab = 'checagem'; applyTab(); });

    const btnExportExcel = document.getElementById('btn-export-excel');
    if (btnExportExcel) btnExportExcel.addEventListener('click', downloadExcel);

    const btnPrintChecagem = document.getElementById('btn-print-checagem');
    if (btnPrintChecagem) btnPrintChecagem.addEventListener('click', printChecagem);

    const btnPrintClassificacao = document.getElementById('btn-print-classificacao');
    if (btnPrintClassificacao) btnPrintClassificacao.addEventListener('click', printClassificacao);

    const btnPrintChamada = document.getElementById('btn-print-chamada');
    if (btnPrintChamada) btnPrintChamada.addEventListener('click', printChamada);

    // EVENTO: MARCAR PRESENÇA DIRETAMENTE NA TABELA
    document.querySelectorAll('.chk-presenca').forEach(chkBox => {
        chkBox.addEventListener('change', async (e) => {
            const athId = e.target.dataset.id;
            const isChecked = e.target.checked;
            
            const bibEl = document.getElementById(`bib-badge-${athId}`);
            if (bibEl) {
                if (isChecked) {
                    bibEl.style.background = '#22c55e';
                    bibEl.style.color = 'white';
                    bibEl.style.borderColor = '#16a34a';
                } else {
                    bibEl.style.background = '#eff6ff';
                    bibEl.style.color = '#2563eb';
                    bibEl.style.borderColor = '#bfdbfe';
                }
            }

            if (!state.equipmentChecks[athId]) state.equipmentChecks[athId] = {};
            state.equipmentChecks[athId].presenca = isChecked;

            try {
                const docRef = doc(db, "equipment_checks", `${competitionId}_${athId}`);
                await setDoc(docRef, { presenca: isChecked }, { merge: true });
            } catch(err) {
                console.error(err);
                alert("Erro ao salvar presença na nuvem.");
            }
        });
    });

    const dlgChk = document.getElementById('dlg-checagem');
    document.querySelectorAll('.btn-abrir-chk').forEach(btn => {
        btn.addEventListener('click', () => {
            const athId = btn.dataset.id;
            const name = btn.dataset.name;
            const bib = btn.dataset.bib;
            const cls = btn.dataset.class;

            document.getElementById('chk-ath-id').value = athId;
            document.getElementById('chk-ath-name').innerText = name;
            document.getElementById('chk-ath-bib').innerText = bib;
            document.getElementById('chk-ath-class').innerText = cls;

            const chk = state.equipmentChecks[athId] || {};
            const isBC3 = String(cls).toUpperCase().includes('BC3');
            
            CHECK_ITEMS.forEach(item => {
                const val = chk[item.id] || '';
                const radOk = document.getElementById(`r_${item.id}_ok`);
                const radX = document.getElementById(`r_${item.id}_x`);
                const radE = document.getElementById(`r_${item.id}_empty`);
                
                if (val === 'OK') radOk.checked = true;
                else if (val === 'X') radX.checked = true;
                else radE.checked = true;

                let isItemDisabled = !state.canEditCheck || (isBC3 && item.id === 'cadeira');
                
                if (isBC3 && item.id === 'cadeira') {
                    if (!chk[item.id]) radE.checked = true; 
                }

                radOk.disabled = isItemDisabled;
                radX.disabled = isItemDisabled;
                radE.disabled = isItemDisabled;
            });

            document.getElementById('chk_obs').value = chk.obs || '';
            document.getElementById('chk_resp').value = chk.responsavel || '';
            
            const chkClassif = chk.classificacao || 'Não';
            const radioClassif = document.querySelector(`input[name="chk_classificacao"][value="${chkClassif}"]`);
            if (radioClassif) radioClassif.checked = true;
            
            document.getElementById('chk_equip_obs').value = chk.equipamento_obs || '';

            const disableInputs = !state.canEditCheck;
            
            document.getElementById('chk_obs').disabled = disableInputs;
            document.getElementById('chk_resp').disabled = disableInputs;
            document.getElementById('chk_equip_obs').disabled = disableInputs;
            document.querySelectorAll('input[name="chk_classificacao"]').forEach(r => r.disabled = disableInputs);

            const btnSave = document.getElementById('btn-save-chk');
            const btnLock = document.getElementById('btn-lock-chk');

            if (!state.canEditCheck) {
                btnSave.style.display = 'none';
                btnLock.style.display = 'none';
            } else {
                btnSave.style.display = 'block';
                btnLock.style.display = 'block';
                if (chk.locked) {
                    btnLock.innerText = '✅ Atualizar Finalizado';
                } else {
                    btnLock.innerText = '✅ Finalizar Checagem';
                }
            }

            dlgChk.showModal();
        });
    });

    const saveCheckData = async (isLocked = false) => {
        const athId = document.getElementById('chk-ath-id').value;
        const responsavel = document.getElementById('chk_resp').value.trim();
        
        if (isLocked && !responsavel) {
            return alert("Para finalizar, é obrigatório selecionar o Árbitro Responsável.");
        }

        const classif = document.querySelector('input[name="chk_classificacao"]:checked')?.value || 'Não';
        const equipObs = document.getElementById('chk_equip_obs').value.trim();

        const payload = {
            competition_id: competitionId,
            athlete_id: athId,
            responsavel: responsavel,
            obs: document.getElementById('chk_obs').value.trim(),
            classificacao: classif,
            equipamento_obs: equipObs,
            locked: isLocked, 
            updated_at: new Date().toISOString()
        };

        CHECK_ITEMS.forEach(item => {
            const checked = document.querySelector(`input[name="chk_${item.id}"]:checked`);
            payload[item.id] = checked ? checked.value : '';
        });

        try {
            document.getElementById('btn-save-chk').disabled = true;
            document.getElementById('btn-lock-chk').disabled = true;

            const docRef = doc(db, "equipment_checks", `${competitionId}_${athId}`);
            await setDoc(docRef, payload, { merge: true });
            
            window.__toast?.(isLocked ? 'Checagem Finalizada com Sucesso!' : 'Rascunho salvo!', 'success');
            
            if (!state.equipmentChecks[athId]) state.equipmentChecks[athId] = {};
            Object.assign(state.equipmentChecks[athId], { id: `${competitionId}_${athId}`, ...payload });
            
            dlgChk.close();
            render();
            
        } catch(e) {
            alert("Erro ao salvar: " + e.message);
        } finally {
            document.getElementById('btn-save-chk').disabled = false;
            document.getElementById('btn-lock-chk').disabled = false;
        }
    };

    document.getElementById('btn-save-chk')?.addEventListener('click', () => saveCheckData(false));
    document.getElementById('btn-lock-chk')?.addEventListener('click', () => saveCheckData(true));

    if (state.isAdminTotal) {
        bindAdminCascadeEvents();
    }
  }

  function bindAdminCascadeEvents() {
      const modal = document.getElementById('modal-cascade-edit');
      const btnCancel = document.getElementById('btn-cancel-edit');
      const btnConfirm = document.getElementById('btn-confirm-edit');
      const btnClear = document.getElementById('btn-clear-fields');
      const btnUndo = document.getElementById('btn-undo-fields');
      const clubDropdown = document.getElementById('edit-ath-club-dropdown');

      let currentOriginalData = {};

      let clubOptionsHtml = '<option value="">-- Escolher um Clube na Lista --</option>';
      state.clubesCache.forEach(c => {
          const nome = escapeHTML(c.nome || c.name || '');
          const sigla = escapeHTML(c.sigla || '');
          const uf = escapeHTML(c.regiao || '');
          clubOptionsHtml += `<option value="${c.id}" data-nome="${nome}" data-sigla="${sigla}" data-uf="${uf}">${nome} ${sigla ? `(${sigla})` : ''}</option>`;
      });
      clubDropdown.innerHTML = clubOptionsHtml;

      clubDropdown.addEventListener('change', (e) => {
          if(e.target.value === "") return; 
          const opt = e.target.options[e.target.selectedIndex];
          document.getElementById('edit-ath-club').value = opt.getAttribute('data-nome');
          document.getElementById('edit-ath-sigla').value = opt.getAttribute('data-sigla');
          document.getElementById('edit-ath-regiao').value = opt.getAttribute('data-uf');
      });

      btnClear.addEventListener('click', () => {
          document.getElementById('edit-ath-name').value = "";
          document.getElementById('edit-ath-rampa').value = "";
          document.getElementById('edit-ath-club').value = "";
          document.getElementById('edit-ath-sigla').value = "";
          document.getElementById('edit-ath-regiao').value = "";
          clubDropdown.value = "";
      });

      btnUndo.addEventListener('click', () => {
          document.getElementById('edit-ath-name').value = currentOriginalData.name;
          document.getElementById('edit-ath-rampa').value = currentOriginalData.rampa;
          document.getElementById('edit-ath-club').value = currentOriginalData.club;
          document.getElementById('edit-ath-sigla').value = currentOriginalData.sigla;
          document.getElementById('edit-ath-regiao').value = currentOriginalData.regiao;
          
          let foundClubOpt = Array.from(clubDropdown.options).find(o => 
              o.getAttribute('data-nome') === currentOriginalData.club || (currentOriginalData.sigla && o.getAttribute('data-sigla') === currentOriginalData.sigla)
          );
          clubDropdown.value = foundClubOpt ? foundClubOpt.value : '';
          
          window.__toast?.('Restaurado para os valores iniciais (Undo).', 'info');
      });

      document.querySelectorAll('.btn-edit-ath').forEach(btn => {
          btn.addEventListener('click', async (e) => {
              const athId = btn.dataset.id;
              const classCode = btn.dataset.class;
              
              const globalData = state.globalMap[String(athId)] || {};

              const localList = state.athletesByClass[classCode] || [];
              const localData = localList.find(x => String(x.id) === String(athId)) || {};

              let aName = globalData.nome || localData.nome || localData.name || '';
              let cName = globalData.clube_nome || localData.clube_nome || localData.clubeDisplay || '';
              let cSigla = globalData.clube_sigla || localData.clube_sigla || localData.sigla || '';
              let cRegiao = globalData.regiao || localData.regiao || '';
              let rampa = globalData.operador_rampa || localData.operador_rampa || '';

              currentOriginalData = {
                  name: aName,
                  rampa: rampa,
                  club: cName,
                  sigla: cSigla,
                  regiao: cRegiao
              };

              let foundClubOpt = Array.from(clubDropdown.options).find(o => {
                  const optNome = o.getAttribute('data-nome') || '';
                  const optSigla = o.getAttribute('data-sigla') || '';
                  return (cName && optNome.toUpperCase() === cName.toUpperCase()) || 
                         (cSigla && optSigla.toUpperCase() === cSigla.toUpperCase());
              });
              
              clubDropdown.value = foundClubOpt ? foundClubOpt.value : '';

              document.getElementById('edit-ath-id').value = athId;
              document.getElementById('edit-ath-class').value = classCode;
              document.getElementById('edit-ath-name').value = aName;
              document.getElementById('edit-ath-rampa').value = rampa; 
              document.getElementById('edit-ath-club').value = cName;
              document.getElementById('edit-ath-sigla').value = cSigla;
              document.getElementById('edit-ath-regiao').value = cRegiao;

              modal.showModal();
          });
      });

      if (btnCancel) {
          btnCancel.addEventListener('click', () => modal.close());
      }

      if (btnConfirm) {
          btnConfirm.addEventListener('click', async () => {
              const athId = document.getElementById('edit-ath-id').value;
              const classCode = document.getElementById('edit-ath-class').value;
              const newName = document.getElementById('edit-ath-name').value.trim();
              const newRampa = document.getElementById('edit-ath-rampa').value.trim();
              const newClub = document.getElementById('edit-ath-club').value.trim();
              const newSigla = document.getElementById('edit-ath-sigla').value.trim();
              const newRegiao = document.getElementById('edit-ath-regiao').value.trim();

              if (!newName) return alert("O Nome é obrigatório.");

              btnConfirm.disabled = true;
              btnConfirm.innerText = "A reescrever banco de dados...";

              try {
                  try {
                      const athRef = doc(db, "atletas", athId);
                      const athSnap = await getDoc(athRef);
                      if (athSnap.exists()) {
                          await updateDoc(athRef, { nome: newName, clube_nome: newClub, clube_sigla: newSigla, regiao: newRegiao, operador_rampa: newRampa });
                      } else {
                          const eqRef = doc(db, "equipes", athId);
                          const eqSnap = await getDoc(eqRef);
                          if (eqSnap.exists()) {
                              await updateDoc(eqRef, { nome: newName, name: newName, club_sigla: newSigla, rep_value_name: newClub, operador_rampa: newRampa });
                          }
                      }
                  } catch(e) { console.warn("Aviso na atualização global:", e); }

                  try {
                      const caRef = doc(db, "competition_athletes", `${competitionId}_${classCode}`);
                      const caSnap = await getDoc(caRef);
                      if (caSnap.exists() && caSnap.data().athletes) {
                          let athletes = caSnap.data().athletes;
                          let changed = false;
                          athletes = athletes.map(a => {
                              if (String(a.firebase_id) === String(athId) || String(a.id) === String(athId)) {
                                  changed = true;
                                  return { ...a, nome: newName, name: newName, clube_nome: newClub, clube_sigla: newSigla, sigla: newSigla, regiao: newRegiao, operador_rampa: newRampa, clubeDisplay: newSigla ? `${newClub} - ${newSigla}` : newClub };
                              }
                              return a;
                          });
                          if (changed) await updateDoc(caRef, { athletes });
                      }
                  } catch(e) {}

                  try {
                      const qDraw = query(collection(db, "draws"), where("competition_id", "==", String(competitionId)), where("class_code", "==", classCode));
                      const drawSnaps = await getDocs(qDraw);
                      for (let dSnap of drawSnaps.docs) {
                          let dData = dSnap.data();
                          let changed = false;
                          
                          if (dData.seeds) {
                              dData.seeds.forEach(s => {
                                  if (s && String(s.id) === String(athId)) { 
                                      s.nome = newName; s.name = newName; 
                                      s.clube_nome = newClub; s.clube_sigla = newSigla; s.sigla = newSigla; 
                                      s.operador_rampa = newRampa; 
                                      changed = true; 
                                  }
                              });
                          }
                          if (dData.groups) {
                              dData.groups.forEach(g => {
                                  if (g.players) {
                                      g.players.forEach(p => {
                                          if (p && String(p.id) === String(athId)) { 
                                              p.nome = newName; p.name = newName; 
                                              p.clube_nome = newClub; p.clube_sigla = newSigla; p.sigla = newSigla; 
                                              p.operador_rampa = newRampa; 
                                              changed = true; 
                                          }
                                      });
                                  }
                              });
                          }
                          if (changed) await updateDoc(dSnap.ref, { seeds: dData.seeds, groups: dData.groups });
                      }
                  } catch(e) {}

                  try {
                      const qMg = query(collection(db, "matches_group"), where("competition_id", "==", String(competitionId)), where("class_code", "==", classCode));
                      const snapMg = await getDocs(qMg);
                      for (let mgSnap of snapMg.docs) {
                          let data = mgSnap.data();
                          let pools = data.matches || data.data || [];
                          let changed = false;
                          
                          pools.forEach(pool => {
                              Object.values(pool.rounds || {}).forEach(roundMatches => {
                                  roundMatches.forEach(m => {
                                      if (String(m.entrant1_id) === String(athId) || String(m.entrant_a_id) === String(athId) || String(m.p1_id) === String(athId)) {
                                          m.p1_name = newName; m.entrant1_name = newName; m.entrant_a_name = newName;
                                          m.p1_club = newSigla || newClub; m.p1_club_nome = newClub; m.p1_club_sigla = newSigla;
                                          m.entrant1_club_nome = newClub; m.entrant1_club_sigla = newSigla;
                                          m.p1_rampa = newRampa; m.entrant1_rampa = newRampa; 
                                          changed = true;
                                      }
                                      if (String(m.entrant2_id) === String(athId) || String(m.entrant_b_id) === String(athId) || String(m.p2_id) === String(athId)) {
                                          m.p2_name = newName; m.entrant2_name = newName; m.entrant_b_name = newName;
                                          m.p2_club = newSigla || newClub; m.p2_club_nome = newClub; m.p2_club_sigla = newSigla;
                                          m.entrant2_club_nome = newClub; m.entrant2_club_sigla = newSigla;
                                          m.p2_rampa = newRampa; m.entrant2_rampa = newRampa; 
                                          changed = true;
                                      }
                                  });
                              });
                          });
                          if (changed) {
                              const field = data.matches ? 'matches' : 'data';
                              await updateDoc(mgSnap.ref, { [field]: pools });
                          }
                      }
                  } catch(e) {}

                  try {
                      const qKo = query(collection(db, "matches_ko"), where("competition_id", "==", String(competitionId)), where("class_code", "==", classCode));
                      const snapKo = await getDocs(qKo);
                      for (let koSnap of snapKo.docs) {
                          let data = koSnap.data();
                          let kos = data.matches || data.data || [];
                          let changed = false;
                          
                          kos.forEach(m => {
                              if (String(m.entrant1_id) === String(athId) || String(m.entrant_a_id) === String(athId) || String(m.p1_id) === String(athId)) {
                                  m.p1_name = newName; m.entrant1_name = newName; m.entrant_a_name = newName;
                                  m.p1_club = newSigla || newClub; m.p1_club_nome = newClub; m.p1_club_sigla = newSigla;
                                  m.entrant1_club_nome = newClub; m.entrant_a_club_nome = newClub;
                                  m.entrant1_club_sigla = newSigla; m.entrant_a_club_sigla = newSigla;
                                  m.p1_rampa = newRampa; m.entrant1_rampa = newRampa; 
                                  changed = true;
                              }
                              if (String(m.entrant2_id) === String(athId) || String(m.entrant_b_id) === String(athId) || String(m.p2_id) === String(athId)) {
                                  m.p2_name = newName; m.entrant2_name = newName; m.entrant_b_name = newName;
                                  m.p2_club = newSigla || newClub; m.p2_club_nome = newClub; m.p2_club_sigla = newSigla;
                                  m.entrant2_club_nome = newClub; m.entrant_b_club_nome = newClub;
                                  m.entrant2_club_sigla = newSigla; m.entrant_b_club_sigla = newSigla;
                                  m.p2_rampa = newRampa; m.entrant2_rampa = newRampa; 
                                  changed = true;
                              }
                          });
                          if (changed) {
                              const field = data.matches ? 'matches' : 'data';
                              await updateDoc(koSnap.ref, { [field]: kos });
                          }
                      }
                  } catch(e) {}

                  await logAction(`[Admin Total] Alteração em cascata. ID: ${athId}. Competição: ${competitionId}`);

                  modal.close();
                  window.__toast?.('Atleta atualizado em todos os sorteios e jogos com sucesso!', 'success');
                  
                  state.athletesByClass[classCode].forEach(a => {
                      if (a.id === athId || a.firebase_id === athId) {
                          a.nome = newName; a.name = newName;
                          a.clube_nome = newClub; a.clube_sigla = newSigla; a.sigla = newSigla;
                          a.regiao = newRegiao; a.operador_rampa = newRampa;
                      }
                  });
                  render(); 

              } catch(e) {
                  alert("Erro crítico durante a atualização: " + e.message);
              } finally {
                  btnConfirm.disabled = false;
                  btnConfirm.innerText = "Salvar e Reescrever Tudo";
              }
          });
      }
  }

  loadData();
}