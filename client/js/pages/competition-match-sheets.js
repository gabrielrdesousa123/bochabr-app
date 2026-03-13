// client/js/pages/competition-match-sheets.js

import { db } from '../firebase-config.js';
import { collection, getDocs, getDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function renderCompetitionMatchSheets(root, hashData) {
    root.innerHTML = `<div style="padding:40px;text-align:center;font-family:sans-serif">
        <h2>A preparar Súmulas...</h2>
        <p style="color:#666;">A carregar dados da competição e agenda do Firebase.</p>
    </div>`;

    let competitionId = null;
    const hash = window.location.hash || '';
    const idMatch = hash.match(/[?&]id=([a-zA-Z0-9_-]+)/) || hash.match(/\/competitions\/([a-zA-Z0-9_-]+)/);
    
    if (idMatch) competitionId = idMatch[1];
    else if (hashData && (hashData.id || hashData.competitionId))
        competitionId = hashData.id || hashData.competitionId;

    if (!competitionId) {
        root.innerHTML = `<div style="margin:20px;padding:20px;border:1px solid red">ID da competição ausente.</div>`;
        return;
    }

    const state = { competition: {}, scheduledMatches: [], officials: [], classesDataMap: {} };

    const API = {
        getComp: async () => {
            const docRef = doc(db, "competitions", String(competitionId));
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : {};
        },
        getMatches: async () => {
            let allMatches = [];

            // Pega matches de Grupo
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
                                p1_club: m.entrant1_club_sigla || m.entrant1_club_nome,
                                p1_bib: m.entrant1_bib,
                                p1_score: m.score1,
                                p2_name: m.entrant2_name,
                                p2_club: m.entrant2_club_sigla || m.entrant2_club_nome,
                                p2_bib: m.entrant2_bib,
                                p2_score: m.score2
                            });
                        });
                    });
                });
            });

            // Pega matches KO
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
                        p1_club: m.entrant_a_club_sigla || m.entrant1_club_sigla,
                        p1_bib: m.entrant_a_bib || m.entrant1_bib,
                        p1_score: m.score_a || m.score1,
                        p2_name: m.entrant_b_name || m.entrant2_name,
                        p2_club: m.entrant_b_club_sigla || m.entrant2_club_sigla,
                        p2_bib: m.entrant_b_bib || m.entrant2_bib,
                        p2_score: m.score_b || m.score2
                    });
                });
            });

            return allMatches;
        },
        getOfficials: async () => {
            const q = query(collection(db, "competition_officials"), where("competition_id", "==", String(competitionId)));
            const snap = await getDocs(q);
            if (!snap.empty) return { success: true, data: snap.docs[0].data().officials || [] };
            return { success: true, data: [] };
        },
        getClasses: async () => {
            const snap = await getDocs(collection(db, "classes"));
            snap.forEach(doc => {
                const c = doc.data();
                const code = c.codigo || c.code || doc.id;
                state.classesDataMap[code] = { ends: c.ends || 4 };
            });
        }
    };

    const escapeHTML = s => !s ? '' : String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    const formatDate = d => { if (!d) return 'A definir'; const p = d.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d; };

    function formatMatchTitle(m) {
        const isGroup = m.match_type === 'GROUP' || (m.round_name && m.round_name.toLowerCase().includes('round')) || m.pool_id;
        if (isGroup) return m.pool_name ? `Grupo ${m.pool_name}` : 'Fase de Grupos';
        const map = {'Quarter Final': 'Quartas', 'Semi-Final': 'Semifinal', 'Final': 'Final', '3rd Place': 'Disputa 3º'};
        return map[m.round_name] || m.round_name || 'Eliminatória';
    }

    function getParticipantData(m, side) {
        const pName = side === 1 ? m.p1_name : m.p2_name;
        const club = side === 1 ? m.p1_club : m.p2_club;
        const bib = side === 1 ? m.p1_bib : m.p2_bib;
        return { name: escapeHTML(pName || ''), club: escapeHTML(club || ''), bib: escapeHTML(bib || '') };
    }

    function getRefName(id) {
        const o = state.officials.find(x => String(x.referee_id || x.id) === String(id));
        return o ? escapeHTML(o.nome_abreviado || o.nome_completo || o.nome) : '';
    }

    async function loadData() {
        try {
            const [c, m, off] = await Promise.all([API.getComp(), API.getMatches(), API.getOfficials(), API.getClasses()]);
            state.competition = c;
            state.officials = off.success ? off.data : [];
            
            // 🔥 CORREÇÃO: Pega TODOS os jogos, mesmo sem data/quadra, e joga os "A definir" pro final
            state.scheduledMatches = m.sort((a,b) => {
                const dA = a.match_date || '9999-99-99';
                const dB = b.match_date || '9999-99-99';
                if (dA !== dB) return dA.localeCompare(dB);
                const tA = a.start_time || '99:99';
                const tB = b.start_time || '99:99';
                return tA.localeCompare(tB);
            });
            renderView();
        } catch (e) { root.innerHTML = `Erro: ${e.message}`; }
    }

    function renderView() {
        const uniqueClasses = [...new Set(state.scheduledMatches.map(m => m.class_code))].filter(Boolean).sort();
        const uniqueDates = [...new Set(state.scheduledMatches.map(m => m.match_date || ''))].sort();
        const uniqueTimes = [...new Set(state.scheduledMatches.map(m => m.start_time || ''))].sort();

        const styles = `
        <style>
            .sheet-container { max-width: 1000px; margin: 20px auto; font-family: sans-serif; }
            .matches-table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #ccc; font-size: 14px; }
            .matches-table th { background: #f8fafc; border-bottom: 2px solid #cbd5e1; }
            .matches-table th, .matches-table td { padding: 10px; border-bottom: 1px solid #eee; text-align: left; }
            .btn-p { background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px; }
            .btn-p:hover { background: #059669; }
            .btn-print-one { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 14px; }
            .btn-print-one:hover { background: #e2e8f0; }
            
            .filter-bar { display: flex; gap: 15px; margin-bottom: 20px; background: #f8fafc; padding: 15px; border: 1px solid #cbd5e1; border-radius: 6px; align-items: center; flex-wrap: wrap; }
            .filter-select { padding: 8px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 14px; min-width: 150px; }

            @media screen { #print-render-area { display: none; } }
            
            @media print {
                @page { size: A4 portrait; margin: 5mm; }
                html, body { width: 210mm; margin: 0; padding: 0; }
                body > *:not(#app) { display: none !important; }
                header, nav, .toolbar, .sheet-header, #list-view-container, .filter-bar { display: none !important; }
                #print-render-area { display: block !important; width: 100%; }
                * { box-sizing: border-box; }
                .match-sheet-page { width: 100%; margin: 0; padding: 5mm; page-break-after: always; font-family: Arial, Helvetica, sans-serif; color: #000; height: 287mm; display: flex; flex-direction: column; }

                .ms-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; border-bottom: 2px solid #000; padding-bottom: 5px; }
                .ms-logo-area { width: 80px; display: flex; justify-content: center; }
                .ms-logo-area img { max-width: 100%; max-height: 50px; object-fit: contain; }
                .ms-title-area { flex: 1; text-align: center; }
                .ms-title-area h2 { margin: 0; font-size: 15px; letter-spacing: 1px; text-transform: uppercase; }
                .ms-title-area p { margin: 2px 0 0 0; font-size: 12px; font-weight: bold; }

                .ms-info-table, .ms-teams-table, .ms-officials-info { width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 6px; font-size: 12px; }
                .ms-info-table td, .ms-teams-table td, .ms-officials-info td { border: 2px solid #000; padding: 4px 6px; }
                .ms-info-table td { height: 26px; vertical-align: middle; }

                .ms-val { font-weight:bold; margin-left: 3px; font-size: 13px; }
                .ms-teams-table td { vertical-align: top; padding: 6px; text-align: center; }
                
                .ms-score-grid { width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 6px; }
                .ms-score-grid th, .ms-score-grid td { border: 1px solid #000; text-align: center; padding: 2px; }
                .ms-score-grid tr:first-child th { border-top: 2px solid #000; }
                .ms-score-grid tr:last-child td { border-bottom: 2px solid #000; }
                .ms-score-grid th:first-child, .ms-score-grid td:first-child { border-left: 2px solid #000; }
                .ms-score-grid th:last-child, .ms-score-grid td:last-child { border-right: 2px solid #000; }
                .ms-score-grid th { background-color: #f1f5f9 !important; -webkit-print-color-adjust: exact; font-weight: bold; font-size: 12px; height: 20px; }
                .ms-score-grid td { height: 22px; vertical-align: middle; }
                .ms-end-num { font-weight: bold; font-size: 13px; background-color: #f8fafc !important; -webkit-print-color-adjust: exact; }

                .ms-final-score-table { border-collapse: collapse; }
                .ms-final-score-table td { height: 32px; border: 1px solid #000; }
                .ms-final-score-table tr:first-child td { border-top: 2px solid #000; }
                .ms-final-score-table tr:last-child td { border-bottom: 2px solid #000; }
                .ms-final-score-table td:first-child { border-left: 2px solid #000; }
                .ms-final-score-table td:last-child { border-right: 2px solid #000; }
                .ms-final-text { background-color: #d1d5db !important; -webkit-print-color-adjust: exact; font-weight: bold; font-size: 14px; letter-spacing: 1px; text-align: center; }

                .ms-violations-box { display: flex; width: 100%; border: 2px solid #000; margin-bottom: 6px; }
                .ms-viol-col { flex: 1; padding: 6px 10px; display: flex; flex-direction: column; }
                .ms-viol-col:first-child { border-right: 2px solid #000; }
                .ms-viol-line { border-bottom: 1px solid #000; margin-top: 14px; width: 100%; height: 1px; }
                .ms-square { width: 20px; height: 20px; border: 2px solid #000; }

                .ms-winner-box { display: flex; align-items: flex-end; gap: 8px; border: 2px solid #000; padding: 8px 10px; margin-bottom: 6px; font-size: 13px; font-weight: bold; }
                .ms-write-line { border-bottom: 1px solid #000; height: 14px; }
                .ms-officials-info td { height: 24px; vertical-align: middle; }
            }
        </style>
        `;

        root.innerHTML = `
            ${styles}
            <div class="sheet-container">
                <div class="sheet-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h1>Gerar Súmulas Físicas</h1>
                    <button class="btn-p" id="btn-print-filtered">🖨️ Imprimir Selecionadas</button>
                </div>
                
                <div class="filter-bar">
                    <div style="font-weight:bold; color:#475569;">Filtros:</div>
                    <select id="filter-date" class="filter-select">
                        <option value="">📅 Todas as Datas</option>
                        ${uniqueDates.map(d => `<option value="${d}">${d ? formatDate(d) : 'A definir'}</option>`).join('')}
                    </select>
                    <select id="filter-time" class="filter-select">
                        <option value="">⏰ Todas as Rodadas</option>
                        ${uniqueTimes.map(t => `<option value="${t}">${t ? `Rodada das ${t}` : 'A definir'}</option>`).join('')}
                    </select>
                    <select id="filter-class" class="filter-select">
                        <option value="">♿ Todas as Classes</option>
                        ${uniqueClasses.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                    <div style="margin-left:auto; font-size:13px; color:#64748b;" id="filter-count"></div>
                </div>

                <div id="list-view-container">
                    <table class="matches-table">
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Hora (Jogo)</th>
                                <th>Quadra</th>
                                <th>Classe</th>
                                <th>Atleta 1</th>
                                <th>Atleta 2</th>
                                <th>Ação</th>
                            </tr>
                        </thead>
                        <tbody id="matches-tbody"></tbody>
                    </table>
                </div>
                <div id="print-render-area"></div>
            </div>
        `;

        function updateTable() {
            const fDate = document.getElementById('filter-date').value;
            const fTime = document.getElementById('filter-time').value;
            const fClass = document.getElementById('filter-class').value;
            
            const filtered = state.scheduledMatches.filter(m => {
                if (fDate && (m.match_date || '') !== fDate) return false;
                if (fTime && (m.start_time || '') !== fTime) return false;
                if (fClass && m.class_code !== fClass) return false;
                return true;
            });
            
            const tbody = document.getElementById('matches-tbody');
            
            if (filtered.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748b;">Nenhum jogo encontrado.</td></tr>`;
            } else {
                tbody.innerHTML = filtered.map(m => {
                    const numJogo = (m.match_number && m.match_number !== 'null') ? `J${m.match_number}` : '-';
                    const dataDisp = m.match_date ? formatDate(m.match_date) : '<span style="color:#94a3b8">A definir</span>';
                    const timeDisp = m.start_time ? `<b>${m.start_time}</b>` : '<span style="color:#94a3b8">A definir</span>';
                    const courtDisp = m.court ? `<b>${m.court}</b>` : '<span style="color:#94a3b8">A definir</span>';

                    return `
                        <tr>
                            <td>${dataDisp}</td>
                            <td>${timeDisp} <span style="color:#64748b; font-size:12px;">(${numJogo})</span></td>
                            <td>${courtDisp}</td>
                            <td><span style="background:#f1f5f9; padding:2px 6px; border-radius:4px; border:1px solid #cbd5e1;">${m.class_code}</span></td>
                            <td>${m.p1_name || '—'}</td>
                            <td>${m.p2_name || '—'}</td>
                            <td><button class="btn-print-one" data-id="${m.id}" title="Imprimir Súmula Individual">🖨️ Imprimir</button></td>
                        </tr>
                    `;
                }).join('');
            }

            document.getElementById('filter-count').innerText = `${filtered.length} jogo(s) na lista`;

            document.querySelectorAll('.btn-print-one').forEach(b => {
                b.onclick = () => {
                    const matchToPrint = state.scheduledMatches.find(x => String(x.id) === String(b.dataset.id));
                    if (matchToPrint) generateAndPrint([matchToPrint]);
                };
            });
            return filtered;
        }

        document.getElementById('filter-date').addEventListener('change', updateTable);
        document.getElementById('filter-time').addEventListener('change', updateTable);
        document.getElementById('filter-class').addEventListener('change', updateTable);

        document.getElementById('btn-print-filtered').onclick = () => {
            const matchesToPrint = updateTable();
            if (matchesToPrint.length === 0) { alert("Não há jogos na lista."); return; }
            generateAndPrint(matchesToPrint);
        };

        updateTable();
    }

    function renderViolLines(viols) {
        if (!viols || viols.length === 0) {
            return `
                <div class="ms-viol-line"></div>
                <div class="ms-viol-line"></div>
                <div class="ms-viol-line"></div>
                <div class="ms-viol-line"></div>
            `;
        }
        
        let h = '<div style="flex: 1; display: flex; flex-direction: column; gap: 4px; margin-top: 6px;">';
        viols.forEach(v => {
            h += `<div style="font-size:10px; font-weight:bold; border-bottom: 1px solid #000; padding-bottom: 2px; width: 100%; white-space: normal; word-wrap: break-word; line-height: 1.2;">${escapeHTML(v.split(' | ')[0])}</div>`;
        });
        h += '</div>';
        return h;
    }

    function generateAndPrint(matches) {
        const area = document.getElementById('print-render-area');
        let html = '';

        matches.forEach((m, index) => {
            const p1 = getParticipantData(m, 1);
            const p2 = getParticipantData(m, 2);
            const ends = state.classesDataMap[m.class_code]?.ends || 4;

            const titleStr = formatMatchTitle(m);
            const compName = escapeHTML(state.competition.nome || state.competition.name || 'SÚMULA DA COMPETIÇÃO');
            
            const refPrincipal = getRefName(m.referee_principal_id || m.referee_id);
            const refLinha = getRefName(m.referee_linha_id);
            const refMesa = getRefName(m.referee_mesa_id);

            let details = {};
            try { if (m.match_details || m.details) details = typeof(m.details) === 'object' ? m.details : JSON.parse(m.match_details || m.details); } catch(e) {}
            
            const p1P = Array.isArray(details.p1_partials) ? details.p1_partials : [];
            const p2P = Array.isArray(details.p2_partials) ? details.p2_partials : [];
            const p1T = Array.isArray(details.p1_times) ? details.p1_times : [];
            const p2T = Array.isArray(details.p2_times) ? details.p2_times : [];
            const p1V = Array.isArray(details.p1_violations) ? details.p1_violations : [];
            const p2V = Array.isArray(details.p2_violations) ? details.p2_violations : [];

            const fS1 = (m.p1_score !== null && m.p1_score !== undefined && String(m.p1_score) !== 'null') ? m.p1_score : '';
            const fS2 = (m.p2_score !== null && m.p2_score !== undefined && String(m.p2_score) !== 'null') ? m.p2_score : '';

            const tb1_s1 = p1P[4] !== undefined && p1P[4] !== null ? p1P[4] : '';
            const tb1_s2 = p2P[4] !== undefined && p2P[4] !== null ? p2P[4] : '';
            const tb1_t1 = p1T[4] || '';
            const tb1_t2 = p2T[4] || '';

            const tb2_s1 = p1P[5] !== undefined && p1P[5] !== null ? p1P[5] : '';
            const tb2_s2 = p2P[5] !== undefined && p2P[5] !== null ? p2P[5] : '';
            const tb2_t1 = p1T[5] || '';
            const tb2_t2 = p2T[5] || '';

            let wName = ""; let wBib = ""; let wClub = "";
            if (m.status === 'COMPLETED' || fS1 !== '' || fS2 !== '') {
                const scoreA = Number(fS1) || 0;
                const scoreB = Number(fS2) || 0;
                if (scoreA > scoreB) { wName = p1.name; wBib = p1.bib; wClub = p1.club; }
                else if (scoreB > scoreA) { wName = p2.name; wBib = p2.bib; wClub = p2.club; }
                else {
                    if (String(m.winner_id) === String(m.entrant1_id) || String(m.winner_entrant_id) === String(m.entrant1_id)) { wName = p1.name; wBib = p1.bib; wClub = p1.club; }
                    else if (String(m.winner_id) === String(m.entrant2_id) || String(m.winner_entrant_id) === String(m.entrant2_id)) { wName = p2.name; wBib = p2.bib; wClub = p2.club; }
                }
            }

            html += `
            <div class="match-sheet-page">
                <div class="ms-header">
                    <div class="ms-logo-area"></div>
                    <div class="ms-title-area">
                        <h2>${compName}</h2>
                        <p>SÚMULA DE JOGO</p>
                    </div>
                    <div class="ms-logo-area"></div>
                </div>
                
                <table class="ms-info-table">
                    <tr>
                        <td width="33%"><strong>Jogo nº:</strong> <span class="ms-val">${m.match_number && m.match_number !== 'null' ? m.match_number : ''}</span></td>
                        <td width="33%"><strong>Data:</strong> <span class="ms-val">${m.match_date ? formatDate(m.match_date) : ''}</span></td>
                        <td width="34%"><strong>Quadra:</strong> <span class="ms-val">${m.court || ''}</span></td>
                    </tr>
                    <tr>
                        <td><strong>Classe:</strong> <span class="ms-val">${escapeHTML(m.class_code)}</span></td>
                        <td><strong>Fase:</strong> <span class="ms-val">${escapeHTML(titleStr)}</span></td>
                        <td><strong>Horário:</strong> <span class="ms-val">${m.start_time || ''}</span></td>
                    </tr>
                </table>

                <table class="ms-teams-table">
                    <tr>
                        <td width="50%" style="border-right: 4px solid #000;">
                            <div style="font-weight: bold; font-size: 13px; margin-bottom: 4px; white-space: normal; word-wrap: break-word;">Nº: <span style="font-size:14px; margin-right:8px;">${m.p1_bib && m.p1_bib !== 'null' ? m.p1_bib : ''}</span> NOME: <span style="font-size:14px;">${p1.name}</span></div>
                            <div style="font-size: 12px; font-weight: bold; margin-bottom: 4px; text-align: center;">Equipe: ${p1.club}</div>
                            <div style="font-size: 12px; font-weight: bold; text-align: center;">Cor: VERMELHA</div>
                        </td>
                        <td width="50%">
                            <div style="font-weight: bold; font-size: 13px; margin-bottom: 4px; white-space: normal; word-wrap: break-word;">Nº: <span style="font-size:14px; margin-right:8px;">${m.p2_bib && m.p2_bib !== 'null' ? m.p2_bib : ''}</span> NOME: <span style="font-size:14px;">${p2.name}</span></div>
                            <div style="font-size: 12px; font-weight: bold; margin-bottom: 4px; text-align: center;">Equipe: ${p2.club}</div>
                            <div style="font-size: 12px; font-weight: bold; text-align: center;">Cor: AZUL</div>
                        </td>
                    </tr>
                </table>

                <table class="ms-score-grid">
                    <tr>
                        <th width="20%">Tempo</th>
                        <th width="15%">Pontos</th>
                        <th width="30%">Parcial</th>
                        <th width="15%">Pontos</th>
                        <th width="20%">Tempo</th>
                    </tr>
                    ${Array.from({length:ends}).map((_,i)=> {
                        const s1 = p1P[i] !== undefined && p1P[i] !== null ? p1P[i] : '';
                        const s2 = p2P[i] !== undefined && p2P[i] !== null ? p2P[i] : '';
                        const t1 = p1T[i] || '';
                        const t2 = p2T[i] || '';
                        return `<tr>
                            <td style="font-size:13px;">${t1}</td>
                            <td style="font-size:15px; font-weight:bold;">${s1}</td>
                            <td class="ms-end-num">${i+1}</td>
                            <td style="font-size:15px; font-weight:bold;">${s2}</td>
                            <td style="font-size:13px;">${t2}</td>
                        </tr>`;
                    }).join('')}
                </table>

                <table class="ms-final-score-table" style="width:100%; margin-bottom:6px; table-layout:fixed;">
                    <tr>
                        <td width="35%" style="font-size:18px; font-weight:bold; text-align:center;">${fS1}</td>
                        <td width="30%" class="ms-final-text">PONTUAÇÃO FINAL</td>
                        <td width="35%" style="font-size:18px; font-weight:bold; text-align:center;">${fS2}</td>
                    </tr>
                </table>

                <table class="ms-score-grid">
                    <tr>
                        <td width="20%" style="font-size:13px;">${tb1_t1}</td>
                        <td width="15%" style="font-size:15px; font-weight:bold;">${tb1_s1}</td>
                        <td width="30%" class="ms-end-num">1º TIE BREAK</td>
                        <td width="15%" style="font-size:15px; font-weight:bold;">${tb1_s2}</td>
                        <td width="20%" style="font-size:13px;">${tb1_t2}</td>
                    </tr>
                    <tr>
                        <td style="font-size:13px;">${tb2_t1}</td>
                        <td style="font-size:15px; font-weight:bold;">${tb2_s1}</td>
                        <td class="ms-end-num">2º TIE BREAK</td>
                        <td style="font-size:15px; font-weight:bold;">${tb2_s2}</td>
                        <td style="font-size:13px;">${tb2_t2}</td>
                    </tr>
                </table>

                <div class="ms-violations-box">
                    <div class="ms-viol-col" style="display: flex; flex-direction: column;">
                        <div style="font-weight: bold; font-size: 12px; margin-bottom: 2px;">Violações/Comentários:</div>
                        ${renderViolLines(p1V)}
                        <div style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: auto; padding-top: 8px; font-size: 11px; font-weight: bold;">
                            <span>Aceite do atleta</span> <div class="ms-square"></div>
                        </div>
                    </div>
                    <div class="ms-viol-col" style="border-right: none; display: flex; flex-direction: column;">
                        <div style="font-weight: bold; font-size: 12px; margin-bottom: 2px;">Violações/Comentários:</div>
                        ${renderViolLines(p2V)}
                        <div style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: auto; padding-top: 8px; font-size: 11px; font-weight: bold;">
                            <span>Aceite do atleta</span> <div class="ms-square"></div>
                        </div>
                    </div>
                </div>

                <div class="ms-winner-box">
                    <strong>Ganhador:</strong> <div class="ms-write-line" style="flex:2; text-align:center; font-size:13px;">${wName}</div>
                    <strong>Nº:</strong> <div class="ms-write-line" style="flex:0.5; text-align:center; font-size:13px;">${wBib}</div>
                    <strong>Clube:</strong> <div class="ms-write-line" style="flex:1.5; text-align:center; font-size:13px;">${wClub}</div>
                </div>

                <table class="ms-officials-info">
                    <tr>
                        <td width="33%"><strong>Mesário:</strong> <span class="ms-val" style="font-weight:normal">${refMesa}</span></td>
                        <td width="33%"><strong>Linha:</strong> <span class="ms-val" style="font-weight:normal">${refLinha}</span></td>
                        <td width="34%"><strong>Árbitro:</strong> <span class="ms-val" style="font-weight:normal">${refPrincipal}</span></td>
                    </tr>
                    <tr>
                        <td colspan="2"><strong>Árbitro Chefe:</strong> ________________________________</td>
                        <td><strong>Hora Final:</strong> _______ : _______</td>
                    </tr>
                </table>
            </div>
            `;
        });

        area.innerHTML = html;
        setTimeout(() => window.print(), 300);
    }

    loadData();
}