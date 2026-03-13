// client/js/pages/competition-report.js

import { db } from '../firebase-config.js';
import { collection, getDocs, doc, getDoc, updateDoc, addDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

export async function renderCompetitionReport(root, hashData) {
    const hash = window.location.hash || '';
    const idMatch = hash.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const competitionId = idMatch ? idMatch[1] : (hashData ? hashData.id : null);

    if (!competitionId) {
        root.innerHTML = `<div style="padding:20px; color:red;">Erro: ID da competição ausente.</div>`;
        return;
    }

    const state = {
        competition: {}, classes: [], rankingsPerClass: {}, standingsPerClass: {}, 
        clubMedals: {}, allGMsRaw: [], allKOsRaw: [], allPoolsRaw: [], athletesByClub: {}, officials: [], allAthletes: []
    };

    let isAdmin = false;
    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
        isAdmin = !!user;
        if (Object.keys(state.competition).length > 0) render();
    });

    function escapeHTML(s = '') { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
    function safeParse(data) {
        if (!data) return {}; if (typeof data === 'object') return data;
        try { let p = JSON.parse(data); return typeof p === 'object' && p !== null ? p : {}; } catch(e) { return {}; }
    }

    const API = {
        loadEverything: async () => {
            const compSnap = await getDoc(doc(db, "competitions", String(competitionId)));
            if (compSnap.exists()) state.competition = compSnap.data();

            const athSnap = await getDocs(collection(db, "atletas"));
            state.allAthletes = athSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const qOff = query(collection(db, "competition_officials"), where("competition_id", "==", String(competitionId)));
            const snapOff = await getDocs(qOff);
            if (!snapOff.empty) state.officials = snapOff.docs[0].data().officials || [];

            const qClasses = query(collection(db, "competition_classes"), where("competition_id", "==", String(competitionId)));
            const snapClasses = await getDocs(qClasses);
            state.classes = snapClasses.docs.map(d => d.data().class_code).sort();

            const qDraw = query(collection(db, "draws"), where("competition_id", "==", String(competitionId)));
            const snapDraw = await getDocs(qDraw);
            state.allPoolsRaw = snapDraw.docs.map(d => d.data());

            const qGM = query(collection(db, "matches_group"), where("competition_id", "==", String(competitionId)));
            const snapGM = await getDocs(qGM);
            state.allGMsRaw = snapGM.docs.map(d => d.data());

            const qKO = query(collection(db, "matches_ko"), where("competition_id", "==", String(competitionId)));
            const snapKO = await getDocs(qKO);
            state.allKOsRaw = snapKO.docs.map(d => d.data());

            for (const cCode of state.classes) {
                const drawData = state.allPoolsRaw.find(d => d.class_code === cCode) || {};
                const gmData = state.allGMsRaw.find(d => d.class_code === cCode) || {};
                const koData = state.allKOsRaw.find(d => d.class_code === cCode) || {};

                const pools = drawData.data || drawData.groups || drawData.draw_data || [];
                const groupMatchesArray = gmData.matches || gmData.data || [];
                const koMatchesArray = koData.matches || koData.data || [];

                let allPlayers = [];
                pools.forEach(pool => { 
                    if (pool.players) {
                        pool.players.forEach(p => {
                            allPlayers.push(p);
                            const clu = p.clube_nome || p.clube_sigla || "Independente";
                            if(!state.athletesByClub[clu]) state.athletesByClub[clu] = [];
                            
                            // Adiciona o Operador de Rampa na base de atletas do clube
                            const athInfo = state.allAthletes.find(a => String(a.id) === String(p.id));
                            if(!state.athletesByClub[clu].find(x => x.id === p.id)) {
                                state.athletesByClub[clu].push({ 
                                    name: p.nome, 
                                    class: cCode, 
                                    id: p.id,
                                    operador_rampa: athInfo ? athInfo.operador_rampa : null
                                });
                            }
                        });
                    }
                });

                const standings = calculatePoolStandings(pools, groupMatchesArray);
                const ranking = calculateFinalRanking(standings, koMatchesArray, allPlayers);

                state.standingsPerClass[cCode] = standings;
                
                // Adiciona o operador de rampa ao ranking
                state.rankingsPerClass[cCode] = ranking.map(r => {
                    const athInfo = state.allAthletes.find(a => String(a.id) === String(r.id));
                    return { ...r, operador_rampa: athInfo ? athInfo.operador_rampa : null };
                });

                ranking.forEach(atleta => {
                    const clube = atleta.clube_nome || atleta.clube_sigla || "Independente";
                    if (!state.clubMedals[clube]) state.clubMedals[clube] = { ouro: 0, prata: 0, bronze: 0, pos4: 0, pos5: 0, pos6: 0, total: 0 };
                    if (atleta.finalPosition === 1) { state.clubMedals[clube].ouro++; state.clubMedals[clube].total++; }
                    else if (atleta.finalPosition === 2) { state.clubMedals[clube].prata++; state.clubMedals[clube].total++; }
                    else if (atleta.finalPosition === 3) { state.clubMedals[clube].bronze++; state.clubMedals[clube].total++; }
                    else if (atleta.finalPosition === 4) state.clubMedals[clube].pos4++;
                    else if (atleta.finalPosition === 5) state.clubMedals[clube].pos5++;
                    else if (atleta.finalPosition === 6) state.clubMedals[clube].pos6++;
                });
            }
        },
        approveResults: async () => {
            if(!confirm("Atenção: Você está prestes a APROVAR os resultados desta competição. Isso publicará a Classificação Final no histórico geral do sistema. Deseja continuar?")) return;

            try {
                const qHist = query(collection(db, "historical_results"), where("competition_id", "==", String(competitionId)));
                const snapHist = await getDocs(qHist);
                await Promise.all(snapHist.docs.map(d => deleteDoc(doc(db, "historical_results", d.id))));

                const insertPromises = [];
                for (const cCode of state.classes) {
                    const rnk = state.rankingsPerClass[cCode] || [];
                    rnk.forEach(a => {
                        insertPromises.push(addDoc(collection(db, "historical_results"), {
                            competition_id: String(competitionId), class_code: cCode, athlete_id: String(a.id),
                            atleta_nome: a.nome, club_id: String(a.clube_id || ''), clube_nome: a.clube_sigla || a.clube_nome || '', rank: a.finalPosition
                        }));
                    });
                }
                await Promise.all(insertPromises);

                await updateDoc(doc(db, "competitions", String(competitionId)), { results_approved: true, status: "FINISHED", historica_csv: true });
                alert("Resultados Aprovados com Sucesso!");
                window.location.hash = `#/resultados`;
            } catch (e) { alert("Erro ao aprovar: " + e.message); }
        }
    };

    function calculatePoolStandings(pools, groupMatchesArray) {
        const standings = {};
        pools.forEach((pool, index) => {
            const poolLetter = String.fromCharCode(65 + index);
            let poolMatchData = groupMatchesArray.find(pm => String(pm.pool_id) === String(pool.id) || String(pm.pool_name).toLowerCase() === String(pool.name).toLowerCase());
            const matches = Object.values(poolMatchData?.rounds || {}).flat();
            let poolMaxDiff = 6;
            matches.forEach(m => { if (m.status === 'COMPLETED') { const det = safeParse(m.details); if (!det.is_wo) { const diff = Math.abs((Number(m.score1??m.score_a)||0) - (Number(m.score2??m.score_b)||0)); if (diff>poolMaxDiff) poolMaxDiff=diff; } } });
            const stats = {};
            (pool.players || []).forEach(p => { stats[p.id] = { ...p, wins: 0, losses: 0, played: 0, pointsFor: 0, pointsAgainst: 0, pointsDiff: 0 }; });
            matches.forEach(m => {
                if (m.status === 'COMPLETED') {
                    const det = safeParse(m.details); const isWO = det.is_wo === true; const wId = m.winner_entrant_id || m.winner_id;
                    let s1 = Number(m.score1??m.score_a)||0; let s2 = Number(m.score2??m.score_b)||0;
                    if (isWO) { if (String(wId) === String(m.entrant1_id||m.entrant_a_id)) { s1=poolMaxDiff; s2=0; } else { s1=0; s2=poolMaxDiff; } }
                    const p1Id = m.entrant1_athlete_id||m.entrant1_id||m.entrant_a_id; const p2Id = m.entrant2_athlete_id||m.entrant2_id||m.entrant_b_id;
                    if (p1Id && stats[p1Id]) { stats[p1Id].played++; stats[p1Id].pointsFor+=s1; stats[p1Id].pointsAgainst+=s2; if(String(wId)===String(p1Id)) stats[p1Id].wins++; else stats[p1Id].losses++; }
                    if (p2Id && stats[p2Id]) { stats[p2Id].played++; stats[p2Id].pointsFor+=s2; stats[p2Id].pointsAgainst+=s1; if(String(wId)===String(p2Id)) stats[p2Id].wins++; else stats[p2Id].losses++; }
                }
            });
            Object.values(stats).forEach(s => s.pointsDiff = s.pointsFor - s.pointsAgainst);
            const ranked = Object.values(stats).sort((a,b) => b.wins - a.wins || b.pointsDiff - a.pointsDiff || b.pointsFor - a.pointsFor);
            
            // Adiciona o operador de rampa no stats final da pool
            const finalPlayers = ranked.map((p, i) => {
                const athInfo = state.allAthletes.find(a => String(a.id) === String(p.id));
                return { ...p, rank: i + 1, operador_rampa: athInfo ? athInfo.operador_rampa : null };
            });
            
            standings[poolLetter] = { players: finalPlayers, maxDiffForWO: poolMaxDiff };
        });
        return standings;
    }

    function calculateFinalRanking(standings, koMatchesArray, allPlayers) {
        const ranking = [];
        const finals = koMatchesArray.filter(m => m.round_name === 'Final' || m.round === 'Final');
        const bronze = koMatchesArray.filter(m => m.round_name === '3rd Place' || m.round === '3rd Place' || String(m.round_name).includes('3º'));
        const quarters = koMatchesArray.filter(m => m.round_name === 'Quarter Final' || m.round === 'Quarter Final' || String(m.round_name).includes('Quartas'));
        const playoffs = koMatchesArray.filter(m => m.round_name === 'Playoffs' || m.round === 'Playoffs');

        const getIds = (m) => { const wId = m.winner_entrant_id||m.winner_id; const e1Id = m.entrant1_id||m.entrant_a_id; return { wId, lId: String(wId)===String(e1Id)?(m.entrant2_id||m.entrant_b_id):e1Id }; };
        const addPlayer = (id, pos, phase) => { const p = allPlayers.find(pl=>String(pl.id)===String(id)); if(p && !ranking.find(r=>r.id===p.id)) ranking.push({...p, finalPosition: pos, phase}); };
        
        if (finals.length > 0 && finals[0].status === 'COMPLETED') { const { wId, lId } = getIds(finals[0]); addPlayer(wId, 1, 'Ouro'); addPlayer(lId, 2, 'Prata'); }
        if (bronze.length > 0 && bronze[0].status === 'COMPLETED') { const { wId, lId } = getIds(bronze[0]); addPlayer(wId, 3, 'Bronze'); addPlayer(lId, 4, '4º Lugar'); }
        
        if (quarters.length > 0) {
            let qf = [];
            quarters.forEach(m => { if (m.status === 'COMPLETED') { const { lId } = getIds(m); const scFor = String(m.winner_id)===String(m.entrant1_id) ? m.score2 : m.score1; const scAg = String(m.winner_id)===String(m.entrant1_id) ? m.score1 : m.score2; qf.push({ id: lId, pDiff: (scFor||0)-(scAg||0), pFor: scFor||0 }); }});
            qf.sort((a,b)=>b.pDiff-a.pDiff || b.pFor-a.pFor).forEach((l,i)=>addPlayer(l.id, 5+i, 'Quartas de Final'));
        }
        if (playoffs.length > 0) {
            let pf = [];
            playoffs.forEach(m => { if (m.status === 'COMPLETED') { const { lId } = getIds(m); const scFor = String(m.winner_id)===String(m.entrant1_id) ? m.score2 : m.score1; const scAg = String(m.winner_id)===String(m.entrant1_id) ? m.score1 : m.score2; pf.push({ id: lId, pDiff: (scFor||0)-(scAg||0), pFor: scFor||0 }); }});
            pf.sort((a,b)=>b.pDiff-a.pDiff || b.pFor-a.pFor).forEach((l,i)=>addPlayer(l.id, (quarters.length>0?9:5)+i, 'Playoffs'));
        }

        let poolRemaining = [];
        Object.values(standings).forEach(pool => pool.players.forEach(p => { if (!ranking.find(r => r.id === p.id)) poolRemaining.push({...p, poolRank: p.rank}); }));
        poolRemaining.sort((a,b) => a.poolRank-b.poolRank || b.wins-a.wins || b.pointsDiff-a.pointsDiff).forEach(p => { if(!ranking.find(r=>r.id===p.id)) ranking.push({...p, finalPosition: ranking.length+1, phase: 'Fase de Grupos'}); });
        return ranking;
    }

    function renderReportScoreSheet(m, roundMaxDiff = 6, cCode = '') {
        const isCompleted = m.status === 'COMPLETED';
        const isBye = m.status === 'SCHEDULED_WITH_BYE' || !m.entrant2_id || !m.match_number;
        if (isBye) return ''; 

        const details = safeParse(m.details || m.match_details);
        const isWO = details.is_wo === true;
        let s1 = Number(m.score1 ?? m.score_entrant1 ?? m.score_a) || 0;
        let s2 = Number(m.score2 ?? m.score_entrant2 ?? m.score_b) || 0;

        const is1Winner = isCompleted && String(m.winner_entrant_id) === String(m.entrant1_id || m.entrant_a_id);
        const is2Winner = isCompleted && String(m.winner_entrant_id) === String(m.entrant2_id || m.entrant_b_id);

        if (isCompleted && isWO) {
            if (is1Winner) { s1 = roundMaxDiff; s2 = 0; } else if (is2Winner) { s1 = 0; s2 = roundMaxDiff; }
        }

        const p1P = details.p1_partials || []; const p2P = details.p2_partials || []; 
        const p1V = details.p1_violations || []; const p2V = details.p2_violations || [];

        const ref = state.officials.find(o => String(o.referee_id || o.id) === String(m.referee_id || m.referee_principal_id));
        const refName = ref ? (ref.nome_completo || ref.nome) : '-';

        let p1Name = m.p1_name || m.entrant1_name || m.entrant_a_name || 'A Definir';
        let p1Club = m.p1_club_sigla || m.entrant1_club_sigla || m.entrant_a_club_sigla || '-';
        let p1Id = m.entrant1_athlete_id || m.entrant1_id || m.entrant_a_id;
        
        let p2Name = m.p2_name || m.entrant2_name || m.entrant_b_name || 'A Definir';
        let p2Club = m.p2_club_sigla || m.entrant2_club_sigla || m.entrant_b_club_sigla || '-';
        let p2Id = m.entrant2_athlete_id || m.entrant2_id || m.entrant_b_id;

        // Adiciona o Operador de Rampa nas Súmulas Impressas
        let p1RampaHtml = ''; let p2RampaHtml = '';
        if (cCode.toUpperCase().includes('BC3')) {
            const a1 = state.allAthletes.find(a => String(a.id) === String(p1Id));
            if (a1 && a1.operador_rampa) p1RampaHtml = ` <span style="font-weight:normal; font-size:8px; color:#666;">(Op: ${escapeHTML(a1.operador_rampa)})</span>`;
            
            const a2 = state.allAthletes.find(a => String(a.id) === String(p2Id));
            if (a2 && a2.operador_rampa) p2RampaHtml = ` <span style="font-weight:normal; font-size:8px; color:#666;">(Op: ${escapeHTML(a2.operador_rampa)})</span>`;
        }

        let partialsStr = [];
        if (isWO) partialsStr.push("Decidido por W.O.");
        else if (isCompleted) {
            for (let i=0; i<6; i++) {
                if (i>=4 && !p1P[i] && !p2P[i] && p1P[i]!==0 && p2P[i]!==0) continue;
                partialsStr.push(`${i<4?`P${i+1}`:`TB${i-3}`}: ${p1P[i]!==null?p1P[i]:'0'}x${p2P[i]!==null?p2P[i]:'0'}`);
            }
        }

        let vStr = [];
        if (p1V.length > 0) vStr.push(`Faltas V: ${p1V.length}`);
        if (p2V.length > 0) vStr.push(`Faltas A: ${p2V.length}`);

        let scoreMid = `${s1} <span style="color:#aaa; font-size:10px;">X</span> ${s2}`;
        if (isCompleted && isWO) {
            scoreMid = is1Winner ? `<span style="background:#dc2626; color:white; padding:2px 4px; border-radius:3px; font-size:9px;">W.O.</span> ${s1} x ${s2}` : `${s1} x ${s2} <span style="background:#dc2626; color:white; padding:2px 4px; border-radius:3px; font-size:9px;">W.O.</span>`;
        } else if (isCompleted && !isWO && s1 === s2) {
            scoreMid = is1Winner ? `${s1} <span style="color:#16a34a; font-size:10px;">(V)</span> x ${s2}` : `${s1} x ${s2} <span style="color:#16a34a; font-size:10px;">(V)</span>`;
        }

        return `
        <div class="result-sheet" style="border: 1px solid #000; margin-bottom: 6px; font-size: 11px; page-break-inside: avoid; border-radius:4px; overflow:hidden;">
            <div style="background: #f0f0f0; padding: 3px 8px; display: flex; justify-content: space-between; border-bottom: 1px solid #000;">
                <b style="font-size:10px;">JOGO ${m.match_number||'-'} | Quadra ${m.court||'-'} ${m.start_time ? `| ${m.start_time}`:''}</b>
                <span style="font-size:10px; color:#555;">Árbitro: ${escapeHTML(refName)}</span>
            </div>
            <div style="display: flex; padding: 6px 4px; align-items:center;">
                <div style="flex:1; text-align:right; font-weight:bold; ${isCompleted && isWO && is2Winner ? 'text-decoration:line-through; opacity:0.5;' : ''} ${is1Winner ? 'color:#16a34a;' : ''}">
                    ${escapeHTML(p1Name)}${p1RampaHtml} <span style="font-weight:normal; font-size:9px; color:#666;">(${escapeHTML(p1Club)})</span>
                </div>
                <div style="width:90px; text-align:center; font-weight:900; font-size:14px; margin: 0 10px;">
                    ${isCompleted ? scoreMid : '- x -'}
                </div>
                <div style="flex:1; text-align:left; font-weight:bold; ${isCompleted && isWO && is1Winner ? 'text-decoration:line-through; opacity:0.5;' : ''} ${is2Winner ? 'color:#16a34a;' : ''}">
                    <span style="font-weight:normal; font-size:9px; color:#666;">(${escapeHTML(p2Club)})</span> ${escapeHTML(p2Name)}${p2RampaHtml}
                </div>
            </div>
            <div style="border-top: 1px dashed #ccc; padding: 3px; font-size: 10px; text-align: center; color: #444; background: #fafafa;">
                ${partialsStr.join(' &nbsp;|&nbsp; ')} ${vStr.length ? ' &nbsp;—&nbsp; <b>' + vStr.join(' | ') + '</b>' : ''}
            </div>
        </div>
        `;
    }

    function render() {
        const isFinished = state.competition.status === 'FINISHED' || state.competition.results_approved === true;
        const showAdminControls = isAdmin && !isFinished;

        const sortedClubs = Object.entries(state.clubMedals).map(([nome, m]) => ({ nome, ...m }))
            .sort((a, b) => b.ouro - a.ouro || b.prata - a.prata || b.bronze - a.bronze || b.pos4 - a.pos4 || b.pos5 - a.pos5 || b.total - a.total);

        const dtObj = state.officials.find(o => String(o.role).toLowerCase().includes('delegado') || String(o.role).toLowerCase().includes('técnico') || String(o.role).toLowerCase().includes('tecnico'));
        const dtName = dtObj ? (dtObj.nome_completo || dtObj.nome) : '________________________________________';

        const styles = `
            <style>
                .report-wrapper { max-width: 900px; margin: 0 auto; padding: 40px; font-family: sans-serif; background: #fff; color: #000; }
                h1, h2, h3, h4 { text-transform: uppercase; margin-top: 30px; border-bottom: 2px solid #000; padding-bottom: 5px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; }
                th, td { border: 1px solid #000; padding: 8px; text-align: center; }
                th { background: #f0f0f0; }
                .text-left { text-align: left !important; }
                .page-break { page-break-before: always; }
                .header-relatorio { text-align: center; margin-bottom: 50px; border-bottom: 2px solid #000; padding-bottom: 20px;}
                
                .nav-bar { display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #cbd5e1; }
                .btn { background: #0f172a; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; }
                .btn-outline { background: white; border: 1px solid #ccc; color: #000; }
                .btn-approve { background: #16a34a; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; }
                
                @media print { .no-print { display: none !important; } .report-wrapper { padding: 0; } }
            </style>
        `;

        let topBarHtml = `
            <div class="nav-bar no-print">
                <button class="btn btn-outline" onclick="window.history.back()">← Voltar</button>
                <div style="display:flex; gap:10px;">
                    <button class="btn" onclick="window.print()">🖨️ Imprimir Relatório Completo</button>
                    ${showAdminControls ? `<button class="btn-approve" id="btn-approve">✅ Aprovar e Finalizar Competição</button>` : ''}
                </div>
            </div>
        `;

        let htmlContent = `
            ${styles}
            <div class="report-wrapper">
                ${topBarHtml}

                <div class="header-relatorio">
                    <h1 style="border:none; margin:0; font-size:28px;">RELATÓRIO TÉCNICO COMPLETO</h1>
                    <p style="font-size:18px;"><strong>${escapeHTML(state.competition.nome)}</strong></p>
                    <p>${escapeHTML(state.competition.local || '')} | ${escapeHTML(state.competition.data_inicio || '')}</p>
                </div>

                <h2>1. Participação de Clubes por Classe</h2>
                <table>
                    <thead>
                        <tr><th class="text-left">Clube</th>${state.classes.map(c => `<th>${c}</th>`).join('')}<th>Total</th></tr>
                    </thead>
                    <tbody>
                        ${Object.keys(state.athletesByClub).sort().map(clube => {
                            let total = 0;
                            return `<tr>
                                <td class="text-left">${clube}</td>
                                ${state.classes.map(c => { const cnt = state.athletesByClub[clube].filter(a => a.class === c).length; total += cnt; return `<td>${cnt || '-'}</td>`; }).join('')}
                                <td style="font-weight:bold;">${total}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>

                <div class="page-break"></div>
                <h2>2. Relação de Atletas por Clube</h2>
                ${Object.keys(state.athletesByClub).sort().map(clube => `
                    <table style="margin-bottom: 20px; width: 80%; margin-left: auto; margin-right: auto; page-break-inside:avoid;">
                        <thead><tr><th colspan="2" class="text-left" style="background:#ddd;">${clube}</th></tr></thead>
                        <tbody>
                            ${state.athletesByClub[clube].sort((a,b) => a.name.localeCompare(b.name)).map(a => `
                            <tr>
                                <td class="text-left">
                                    <div style="font-weight:bold;">${escapeHTML(a.name)}</div>
                                    ${a.class.toUpperCase().includes('BC3') && a.operador_rampa ? `<div style="font-size:10px; color:#64748b;">Op. Rampa: ${escapeHTML(a.operador_rampa)}</div>` : ''}
                                </td>
                                <td style="width:100px; vertical-align:middle;">${a.class}</td>
                            </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `).join('')}

                <div class="page-break"></div>
                <h2>3. Classificação Geral de Clubes</h2>
                <table>
                    <thead>
                        <tr><th>Pos</th><th class="text-left">Clube</th><th>🥇 Ouro</th><th>🥈 Prata</th><th>🥉 Bronze</th><th>4º</th><th>5º</th><th>Total</th></tr>
                    </thead>
                    <tbody>
                        ${sortedClubs.map((c, i) => `<tr><td>${i+1}º</td><td class="text-left" style="${i<3?'font-weight:bold;':''}">${c.nome}</td><td>${c.ouro}</td><td>${c.prata}</td><td>${c.bronze}</td><td>${c.pos4}</td><td>${c.pos5}</td><td style="font-weight:bold;">${c.total}</td></tr>`).join('')}
                    </tbody>
                </table>

                <div class="page-break"></div>
                <h2 style="text-align:center;">4. RESULTADOS DETALHADOS POR CLASSE</h2>
        `;

        state.classes.forEach(cCode => {
            const gmData = state.allGMsRaw.find(m => m.class_code === cCode) || {};
            const pools = gmData.matches || gmData.data || [];
            const koData = state.allKOsRaw.find(m => m.class_code === cCode) || {};
            const koMatchesArray = koData.matches || koData.data || [];
            
            const std = state.standingsPerClass[cCode] || {};
            const rnk = state.rankingsPerClass[cCode] || [];
            const isBC3 = cCode.toUpperCase().includes('BC3');

            htmlContent += `<div style="margin-bottom: 50px;"><h3 style="background:#000; color:#fff; padding:10px; text-align:center; font-size:20px; page-break-before: always;">CLASSE ${cCode}</h3>`;

            if (pools.length > 0) {
                htmlContent += `<h4>A. Partidas da Fase de Grupos</h4>`;
                pools.forEach(p => {
                    const roundsSorted = Object.keys(p.rounds || {}).sort((a,b) => (parseInt(a.replace(/\D/g, ''))||0) - (parseInt(b.replace(/\D/g, ''))||0) || a.localeCompare(b));
                    roundsSorted.forEach(r => {
                        htmlContent += `<p style="font-weight:bold; margin: 20px 0 5px 0; font-size: 14px; text-transform:uppercase;">Grupo ${p.pool_name || p.pool_id} - ${r}</p>`;
                        p.rounds[r].sort((a,b)=>parseInt(a.match_number)-parseInt(b.match_number)).forEach(m => {
                            htmlContent += renderReportScoreSheet(m, p.maxDiffForWO || 6, cCode);
                        });
                    });
                });
            }

            if (koMatchesArray.length > 0) {
                htmlContent += `<h4>B. Partidas da Fase Eliminatória</h4>`;
                const orderKO = ['Playoffs', 'Quarter Final', 'Semi-Final', '3rd Place', 'Final'];
                orderKO.forEach(fase => {
                    const mFase = koMatchesArray.filter(m => m.round_name === fase || m.round === fase);
                    if (mFase.length > 0) {
                        let maxD = 6;
                        mFase.forEach(m => { const d = safeParse(m.details); if(!d.is_wo){ const df = Math.abs((Number(m.score1??m.score_a)||0)-(Number(m.score2??m.score_b)||0)); if(df>maxD) maxD=df; }});
                        const fName = fase === '3rd Place' ? 'Disputa de 3º Lugar' : (fase === 'Quarter Final' ? 'Quartas de Final' : fase);
                        htmlContent += `<p style="font-weight:bold; margin: 20px 0 5px 0; font-size: 14px; text-transform:uppercase; border-bottom: 1px solid #ccc;">${fName}</p>`;
                        mFase.sort((a,b)=>parseInt(a.match_number)-parseInt(b.match_number)).forEach(m => { htmlContent += renderReportScoreSheet(m, maxD, cCode); });
                    }
                });
            }

            if (Object.keys(std).length > 0) {
                htmlContent += `<h4 style="margin-top:30px;">C. Classificação da Fase de Grupos</h4>`;
                Object.keys(std).sort().forEach(poolLetter => {
                    const poolData = std[poolLetter];
                    if (poolData.players.length > 0) {
                        htmlContent += `
                            <p style="font-weight:bold; margin-bottom:5px; font-size:12px;">Grupo ${poolLetter}</p>
                            <table style="margin-bottom: 15px;">
                                <thead><tr><th>Pos</th><th class="text-left">Atleta</th><th>J</th><th>V</th><th>D</th><th>Pró</th><th>Contra</th><th>Saldo</th></tr></thead>
                                <tbody>
                                    ${poolData.players.map(p => `
                                    <tr>
                                        <td>${p.rank}º</td>
                                        <td class="text-left">
                                            <div style="font-weight:bold;">${escapeHTML(p.nome)} <span style="font-size:9px; color:#666; font-weight:normal;">(${escapeHTML(p.clube_sigla||'-')})</span></div>
                                            ${isBC3 && p.operador_rampa ? `<div style="font-size:9px; color:#64748b;">Op: ${escapeHTML(p.operador_rampa)}</div>` : ''}
                                        </td>
                                        <td>${(p.wins||0)+(p.losses||0)||p.played||0}</td><td>${p.wins||0}</td><td>${p.played ? p.played-p.wins : 0}</td><td>${p.pointsFor||0}</td><td>${p.pointsAgainst||0}</td><td>${p.pointsDiff||0}</td>
                                    </tr>`).join('')}
                                </tbody>
                            </table>
                        `;
                    }
                });
            }

            if (rnk.length > 0) {
                htmlContent += `<h4>D. Classificação Final da Classe</h4>`;
                htmlContent += `
                    <table>
                        <thead><tr><th>Pos</th><th class="text-left">Atleta</th><th class="text-left">Clube</th><th>Fase Alcançada</th></tr></thead>
                        <tbody>${rnk.map(a => `
                        <tr>
                            <td><strong>${a.finalPosition}º</strong></td>
                            <td class="text-left">
                                <div style="font-weight:bold;">${escapeHTML(a.nome)}</div>
                                ${isBC3 && a.operador_rampa ? `<div style="font-size:10px; color:#64748b;">Op: ${escapeHTML(a.operador_rampa)}</div>` : ''}
                            </td>
                            <td class="text-left" style="vertical-align:middle;">${escapeHTML(a.clube_sigla || '-')}</td>
                            <td style="vertical-align:middle;">${a.phase}</td>
                        </tr>`).join('')}</tbody>
                    </table>
                `;
            }

            htmlContent += `</div>`;
        });

        htmlContent += `
                <div style="margin-top: 80px; text-align: center; page-break-inside: avoid;">
                    <div style="display:inline-block; width: 400px; border-top: 1px solid #000; margin: 0 auto; padding-top:10px;">
                        <strong style="font-size: 16px;">${escapeHTML(dtName)}</strong><br>
                        <span>Delegado Técnico</span>
                    </div>
                </div>
            </div>
        `;

        root.innerHTML = htmlContent;

        if (showAdminControls) {
            document.getElementById('btn-approve').onclick = API.approveResults;
        }
    }

    root.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; height: 50vh; flex-direction: column;">
        <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #0f172a; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <p style="margin-top: 15px; color: #64748b; font-family: sans-serif; font-weight:bold;">Montando Relatório Técnico...</p>
        <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
      </div>
    `;

    await API.loadEverything();
    render();
}