// client/js/pages/simulador-ia.js

import { canEditGlobal } from '../permissions.js';

export async function renderSimuladorIA(root) {
    if (!canEditGlobal('simulador')) {
        root.innerHTML = '<div style="padding:20px; color:red; font-weight:bold; text-align:center;">Acesso Negado. Apenas oficiais autorizados podem usar a War Room.</div>';
        return;
    }

    const rawData = sessionStorage.getItem('simulador_draft_data');
    if (!rawData) {
        root.innerHTML = `
            <div style="padding:40px; text-align:center; font-family:sans-serif;">
                <h2 style="color:#0f172a;">🤖 War Room - Simulador Offline</h2>
                <p style="color:#64748b;">Nenhum rascunho encontrado. Primeiro vá ao <b>Simulador</b>, crie a sua competição fictícia, adicione as classes e depois clique no botão "🤖 Abrir War Room" lá para transferir os dados para cá.</p>
                <button onclick="window.location.hash='#/simulador'" style="margin-top:20px; padding:10px 20px; background:#2563eb; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">Ir para o Simulador</button>
            </div>`;
        return;
    }

    const draftState = JSON.parse(rawData);

    const state = {
        competition: draftState.competition || {},
        allMatches: [],
        classesDataMap: {},
        generatedSlots: [],
        unscheduledMatches: [],
        customRules: [] 
    };

    draftState.matchesPool.forEach(tuple => {
        const classCode = tuple[0];
        const matchesArray = tuple[1];
        
        matchesArray.forEach(m => {
            state.allMatches.push({ ...m, class_code: classCode, match_type: m.meta?.type === 'Grupo' ? 'GROUP' : 'KO' });
        });
    });

    const API = {
        getClassesOffline: async () => {
            if (draftState.allClasses) {
                draftState.allClasses.forEach(c => {
                    state.classesDataMap[c.codigo || c.code || c.id] = { bg: c.ui_bg || '#f8f9fa', fg: c.ui_fg || '#212529', match_time: c.match_time || c.tempo_partida || 50 }; 
                });
            }
        }
    };

    const escapeHTML = s => String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

    function timeToMins(t) { if (!t) return 0; const [h, m] = t.split(':').map(Number); return (h * 60) + (m || 0); }
    function minsToTime(mins) { return `${String(Math.floor(mins / 60)).padStart(2,'0')}:${String(mins % 60).padStart(2,'0')}`; }

    function getMatchDur(classCode) {
        const cData = state.classesDataMap[classCode] || {};
        let d = parseInt(cData.match_time || 50);
        return (isNaN(d) || d < 30) ? 50 : d;
    }

    // 🔥 MOTOR IA: DESCANSO E REGRAS POR RODADA (E NÃO POR TEMPO) 🔥
    function generateSmartSchedule(config) {
        state.generatedSlots = [];
        state.unscheduledMatches = [];

        let pendingMatches = state.allMatches.map((m, index) => {
            let p1Name = "A Definir", p2Name = "A Definir";
            let p1Id = "", p2Id = "";

            if (m.label && m.label.includes('Grupo')) {
                const dMatch = m.details?.match(/(\d+)×(\d+)/);
                if (dMatch) {
                    p1Name = `Atleta ${dMatch[1]}`;
                    p2Name = `Atleta ${dMatch[2]}`;
                }
                let groupIdentifier = m.meta?.group || m.pool_name || 'NOGROUP';
                p1Id = `F_${m.class_code}_${groupIdentifier}_${p1Name}`;
                p2Id = `F_${m.class_code}_${groupIdentifier}_${p2Name}`;
            } else {
                p1Id = `KO_${index}_P1`;
                p2Id = `KO_${index}_P2`;
            }
            
            let order = 0;
            if (m.match_type === 'GROUP') {
                let rStr = m.meta?.round || m.round_name || '1';
                order = parseInt(String(rStr).replace(/\D/g, '')) || 1;
            } else {
                const fase = String(m.meta?.fase || m.label || '').toUpperCase();
                if (fase.includes('PLAYOFF') || fase.includes('OITAVAS')) order = 100;
                else if (fase.includes('QUARTAS')) order = 120;
                else if (fase.includes('SEMI')) order = 130;
                else if (fase.includes('3º') || fase.includes('FINAL')) order = 140;
                else order = 150;
            }

            const dur = getMatchDur(m.class_code);

            return { 
                ...m, 
                _tempId: index, 
                phase_order: order, 
                duration: dur, 
                p1Id: p1Id, 
                p2Id: p2Id, 
                p1Name: p1Name, 
                p2Name: p2Name, 
                p1Club: 'Simulador', 
                p2Club: 'Simulador' 
            };
        });

        const dStart = new Date(config.dateStart + 'T00:00:00');
        const dEnd = new Date(config.dateEnd + 'T00:00:00');

        let athleteLogs = {}; 
        let dailyGames = {};  
        let classDailyGames = {}; 
        let schedule = [];

        for (let d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const limitMin = timeToMins(config.timeEnd);

            const shifts = [
                { id: 'MORNING', startMin: timeToMins(config.startMorn), rounds: config.rMorning },
                { id: 'AFTERNOON', startMin: timeToMins(config.startAft), rounds: config.rAfternoon },
                { id: 'NIGHT', startMin: timeToMins(config.startNight), rounds: config.rNight }
            ];

            let globalCurrentMin = 0;
            let dailyRoundIndex = 0; // Índice da Rodada do Dia (Ex: 1 a 10)

            for (let shift of shifts) {
                if (shift.rounds <= 0) continue;
                globalCurrentMin = Math.max(globalCurrentMin, shift.startMin);

                for (let r = 1; r <= shift.rounds; r++) {
                    if (pendingMatches.length === 0) break;
                    if (globalCurrentMin >= limitMin) break;

                    dailyRoundIndex++; // Incrementa a Rodada Atual do Dia

                    let minPhasePerClass = {};
                    pendingMatches.forEach(m => {
                        if (minPhasePerClass[m.class_code] === undefined || m.phase_order < minPhasePerClass[m.class_code]) {
                            minPhasePerClass[m.class_code] = m.phase_order;
                        }
                    });

                    let eligibleMatches = [];
                    for (let m of pendingMatches) {
                        if (m.phase_order > minPhasePerClass[m.class_code]) continue;
                        
                        let canPlay = true;
                        let p1 = m.p1Id; let p2 = m.p2Id;
                        
                        if (config.maxGamesPerDay > 0 && m.match_type === 'GROUP') {
                            if ((dailyGames[`${p1}_${dateStr}`] || 0) >= config.maxGamesPerDay) canPlay = false;
                            if ((dailyGames[`${p2}_${dateStr}`] || 0) >= config.maxGamesPerDay) canPlay = false;
                        }

                        // 🔥 DESCANSO BASEADO EM RODADAS (INDEX) E NÃO MINUTOS 🔥
                        if (canPlay && config.restRounds > 0 && m.match_type === 'GROUP') {
                            const p1LastRound = (athleteLogs[p1] || []).filter(l => l.date === dateStr).reduce((max, l) => Math.max(max, l.roundIndex), -999);
                            const p2LastRound = (athleteLogs[p2] || []).filter(l => l.date === dateStr).reduce((max, l) => Math.max(max, l.roundIndex), -999);
                            
                            // Se a rodada atual menos a última rodada jogada for MENOR OU IGUAL ao descanso exigido, bloqueia!
                            if (dailyRoundIndex - p1LastRound <= config.restRounds) canPlay = false;
                            if (dailyRoundIndex - p2LastRound <= config.restRounds) canPlay = false;
                        }

                        if (canPlay && state.customRules.length > 0) {
                            for (let rule of state.customRules) {
                                if (rule.classCode === m.class_code) {
                                    if (rule.target === shift.id && rule.type === 'MUST_NOT') canPlay = false;
                                    if (rule.target !== shift.id && ['MORNING','AFTERNOON','NIGHT'].includes(rule.target) && rule.type === 'MUST') canPlay = false;
                                    
                                    if (rule.target.startsWith('ROUND_')) {
                                        const tRound = parseInt(rule.target.split('_')[1]);
                                        if (dailyRoundIndex === tRound && rule.type === 'MUST_NOT') canPlay = false;
                                        if (dailyRoundIndex !== tRound && rule.type === 'MUST') canPlay = false;
                                    }
                                }
                            }
                        }

                        if (canPlay) eligibleMatches.push(m);
                    }

                    let blocksMap = {};
                    eligibleMatches.forEach(m => {
                        let key = m.class_code + '|' + m.phase_order;
                        if (!blocksMap[key]) {
                            blocksMap[key] = { class_code: m.class_code, phase_order: m.phase_order, duration: m.duration, matches: [] };
                        }
                        blocksMap[key].matches.push(m);
                    });

                    let sortedBlocks = Object.values(blocksMap);
                    sortedBlocks.sort((a, b) => {
                        let gamesA = classDailyGames[`${a.class_code}_${dateStr}`] || 0;
                        let gamesB = classDailyGames[`${b.class_code}_${dateStr}`] || 0;
                        if (gamesA !== gamesB) return gamesA - gamesB; 
                        if (a.phase_order !== b.phase_order) return a.phase_order - b.phase_order; 
                        if (a.duration !== b.duration) return b.duration - a.duration; 
                        return a.class_code.localeCompare(b.class_code);
                    });

                    let slotMatches = [];
                    let courtsLeft = config.courtsCount;
                    
                    for (let block of sortedBlocks) {
                        if (courtsLeft <= 0) break;

                        block.matches.sort((a, b) => {
                            const lA = a.label || '';
                            const lB = b.label || '';
                            return lA.localeCompare(lB);
                        });

                        let matchesToSchedule = [];
                        for (let m of block.matches) {
                            if (courtsLeft <= 0) break;
                            
                            let p1 = m.p1Id; let p2 = m.p2Id;
                            if (slotMatches.some(sm => sm.p1Id === p1 || sm.p2Id === p1 || sm.p1Id === p2 || sm.p2Id === p2)) continue;
                            if (matchesToSchedule.some(sm => sm.p1Id === p1 || sm.p2Id === p1 || sm.p1Id === p2 || sm.p2Id === p2)) continue;

                            matchesToSchedule.push(m);
                            courtsLeft--;
                        }

                        if (matchesToSchedule.length > 0) {
                            slotMatches.push(...matchesToSchedule);
                            classDailyGames[`${block.class_code}_${dateStr}`] = (classDailyGames[`${block.class_code}_${dateStr}`] || 0) + matchesToSchedule.length;
                        }
                    }

                    if (slotMatches.length > 0) {
                        let slotMaxDuration = Math.max(...slotMatches.map(m => m.duration));
                        
                        slotMatches.sort((a, b) => {
                            if (a.duration !== b.duration) return b.duration - a.duration;
                            if (a.class_code !== b.class_code) return a.class_code.localeCompare(b.class_code);
                            const lA = a.label || '';
                            const lB = b.label || '';
                            if (a.match_type !== 'GROUP' || b.match_type !== 'GROUP') return lA.localeCompare(lB);
                            return (a.meta?.group || '').localeCompare(b.meta?.group || '');
                        });

                        slotMatches.forEach((m, idx) => {
                            schedule.push({
                                date: dateStr,
                                time: minsToTime(globalCurrentMin),
                                mins: globalCurrentMin,
                                court: idx + 1,
                                match: m
                            });
                            
                            if (m.match_type === 'GROUP') {
                                if (m.p1Id) {
                                    if (!athleteLogs[m.p1Id]) athleteLogs[m.p1Id] = [];
                                    // 🔥 Regista exatamente a Rodada do Dia em que jogou!
                                    athleteLogs[m.p1Id].push({ date: dateStr, roundIndex: dailyRoundIndex });
                                    dailyGames[`${m.p1Id}_${dateStr}`] = (dailyGames[`${m.p1Id}_${dateStr}`] || 0) + 1;
                                }
                                if (m.p2Id) {
                                    if (!athleteLogs[m.p2Id]) athleteLogs[m.p2Id] = [];
                                    athleteLogs[m.p2Id].push({ date: dateStr, roundIndex: dailyRoundIndex });
                                    dailyGames[`${m.p2Id}_${dateStr}`] = (dailyGames[`${m.p2Id}_${dateStr}`] || 0) + 1;
                                }
                            }
                            
                            pendingMatches = pendingMatches.filter(pm => pm._tempId !== m._tempId);
                        });

                        globalCurrentMin += slotMaxDuration;
                    } else {
                        globalCurrentMin += 30; 
                    }
                }
            }
        }
        
        state.generatedSlots = schedule;
        state.unscheduledMatches = pendingMatches;
        renderPreview(); 
    }

    // 🔥 ATUALIZADOR DINÂMICO DE REGRAS (Lê os inputs e cria as opções em tempo real) 🔥
    function updateRulesDropdown() {
        const rMorn = parseInt(document.getElementById('ia-r-morn')?.value) || 0;
        const rAft = parseInt(document.getElementById('ia-r-aft')?.value) || 0;
        const rNight = parseInt(document.getElementById('ia-r-night')?.value) || 0;
        const totalRounds = rMorn + rAft + rNight;
        
        const targetSelect = document.getElementById('rule-target');
        if (!targetSelect) return;
        
        const currentVal = targetSelect.value;
        
        let html = `
            <optgroup label="Turnos (Período do Dia)">
                <option value="MORNING">No Turno da Manhã</option>
                <option value="AFTERNOON">No Turno da Tarde</option>
                <option value="NIGHT">No Turno da Noite</option>
            </optgroup>
            <optgroup label="Ordem Cronológica do Dia">
        `;
        
        // Se colocar 10 rodadas somadas, cria 10 opções. 
        for(let i = 1; i <= totalRounds; i++) {
            html += `<option value="ROUND_${i}">Na ${i}ª Rodada do Dia</option>`;
        }
        html += `</optgroup>`;
        
        targetSelect.innerHTML = html;
        
        if (targetSelect.querySelector(`option[value="${currentVal}"]`)) {
            targetSelect.value = currentVal;
        }
    }

    async function init() {
        root.innerHTML = `<div style="text-align:center; padding: 50px; font-family:sans-serif;">A carregar dados do Simulador para a War Room...</div>`;
        await API.getClassesOffline();
        
        if (state.allMatches.length === 0) {
            root.innerHTML = `<div style="text-align:center; padding: 50px; font-family:sans-serif;">Nenhum jogo recebido do Simulador.</div>`;
            return;
        }
        renderLayout();
    }

    function renderRulesList() {
        const ctn = document.getElementById('rules-container');
        if(!ctn) return;
        
        if (state.customRules.length === 0) {
            ctn.innerHTML = `<div style="font-size:12px; color:#64748b; padding:10px; background:#f8fafc; border-radius:6px; border:1px dashed #cbd5e1; text-align:center;">Nenhuma regra configurada. O algoritmo usará padrões.</div>`;
            return;
        }
        
        ctn.innerHTML = state.customRules.map((r, idx) => {
            let desc = '';
            if (r.target === 'MORNING') desc = 'No Turno da Manhã';
            else if (r.target === 'AFTERNOON') desc = 'No Turno da Tarde';
            else if (r.target === 'NIGHT') desc = 'No Turno da Noite';
            else if (r.target.startsWith('ROUND_')) {
                desc = `Na ${r.target.split('_')[1]}ª Rodada do Dia`;
            }
            
            return `
            <div style="background:#fff; border:1px solid #cbd5e1; border-radius:6px; padding:10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; font-size:13px;">
                <div>A Classe <strong>${escapeHTML(r.classCode)}</strong> <span style="color:${r.type==='MUST'?'#16a34a':'#dc2626'}; font-weight:bold;">${r.type==='MUST'?'DEVE':'NÃO DEVE'} jogar</span> ${desc}.</div>
                <button class="btn-remove-rule" data-idx="${idx}" style="background:transparent; border:none; color:#ef4444; font-weight:bold; cursor:pointer;">✖</button>
            </div>
            `;
        }).join('');

        document.querySelectorAll('.btn-remove-rule').forEach(b => {
            b.onclick = (e) => {
                state.customRules.splice(parseInt(e.target.dataset.idx), 1);
                renderRulesList();
            };
        });
    }

    function renderLayout() {
        const uniqueClasses = [...new Set(state.allMatches.map(m => m.class_code))].filter(Boolean).sort();

        const styles = `
            <style>
                .war-room { max-width: 1600px; margin: 0 auto; display: flex; gap: 20px; font-family: sans-serif; }
                .panel { background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                .controls { width: 360px; flex-shrink: 0; display:flex; flex-direction:column; gap:20px; overflow-y:auto; max-height:85vh; padding-right:10px; }
                .controls::-webkit-scrollbar { width:6px; } .controls::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:4px; }
                .preview { flex: 1; overflow-y: auto; max-height: 85vh; padding: 10px; }
                
                .section-title { font-size: 14px; font-weight: 900; color: #0f172a; text-transform: uppercase; margin: 0 0 10px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; }
                .form-group { margin-bottom: 12px; }
                .form-group label { display: block; font-size: 12px; font-weight: bold; color: #475569; margin-bottom: 4px; }
                .form-group input, .form-group select { width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; box-sizing: border-box; }
                
                .btn-run { background: #8b5cf6; color: white; border: none; padding: 15px; border-radius: 8px; font-size: 16px; font-weight: 900; cursor: pointer; width: 100%; transition: 0.2s; box-shadow: 0 4px 10px rgba(139, 92, 246, 0.3); text-transform: uppercase; }
                .btn-run:hover { background: #7c3aed; transform: translateY(-2px); }
                .btn-save { background: #16a34a; color: white; border: none; padding: 15px; border-radius: 8px; font-size: 16px; font-weight: 900; cursor: pointer; width: 100%; transition: 0.2s; margin-top: 15px; text-transform: uppercase;}
                .btn-save:hover { background: #15803d; }
                .btn-outline { border: 1px solid #cbd5e1; background: white; color: #475569; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; }
                .btn-outline:hover { background: #f1f5f9; }

                .alert-danger { background: #fef2f2; border: 1px solid #fca5a5; padding: 15px; border-radius: 8px; color: #b91c1c; font-weight: bold; margin-bottom: 20px; line-height:1.4; }
                .stats-box { display:flex; gap:15px; margin-bottom:20px; }
                .stat-card { flex:1; padding:15px; border-radius:8px; border:1px solid #e2e8f0; text-align:center; background:#f8fafc; }
                .stat-card.success { background:#f0fdf4; border-color:#86efac; color:#166534; }
                .stat-card.danger { background:#fef2f2; border-color:#fca5a5; color:#b91c1c; }
                
                .shift-box { background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; display:flex; flex-direction:column; gap:8px; }
                .shift-row { display: flex; justify-content: space-between; align-items: center; }
                .shift-row input { width: 60px; text-align: center; font-weight: bold; }
            </style>
        `;

        const defStart = state.competition.startDate || new Date().toISOString().split('T')[0];
        const defEnd = state.competition.endDate || defStart;

        root.innerHTML = `
            ${styles}
            <div style="max-width: 1600px; margin: 0 auto 15px; display:flex; justify-content:space-between; align-items:center; font-family:sans-serif;">
                <div>
                    <h2 style="margin:0; color:#0f172a;">🤖 War Room - Otimizador Magnético Final</h2>
                    <p style="margin:0; font-size:13px; color:#64748b;">Descanso baseado estritamente em Rodadas (e não tempo). O dropdown de regras atualiza-se automaticamente à medida que altera as rodadas do dia.</p>
                </div>
                <button onclick="window.location.hash='#/simulador'" style="padding:10px 20px; border:1px solid #ccc; border-radius:6px; cursor:pointer; background:#fff; font-weight:bold;">← Voltar ao Simulador Base</button>
            </div>

            <div class="war-room">
                <div class="panel controls">
                    <div>
                        <h3 class="section-title">1. Parâmetros Temporais</h3>
                        <div style="display:flex; gap:10px;">
                            <div class="form-group" style="flex:1;"><label>Data Inicial</label><input type="date" id="ia-start-date" value="${defStart}"></div>
                            <div class="form-group" style="flex:1;"><label>Data Final</label><input type="date" id="ia-end-date" value="${defEnd}"></div>
                        </div>
                        <div class="form-group"><label>Encerramento do Pavilhão (Limite)</label><input type="time" id="ia-time-end" value="${state.competition.dayEnd || '20:00'}"></div>
                        <div class="form-group"><label>Quadras Disponíveis</label><input type="number" id="ia-courts" value="${state.competition.courts || 6}" min="1" max="20" readonly style="background:#e2e8f0; color:#64748b;"></div>
                    </div>

                    <div>
                        <h3 class="section-title">2. Estrutura de Turnos e Rodadas</h3>
                        <div class="shift-box">
                            <div class="shift-row">
                                <span style="font-size:13px; font-weight:bold; color:#0f172a; width: 60px;">☀️ Manhã</span>
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <input type="time" id="ia-start-morn" value="${state.competition.dayStart || '09:00'}" style="width:90px; padding:4px; font-size:12px;">
                                    <input type="number" id="ia-r-morn" class="round-input" value="3" min="0" max="10" style="width:50px; padding:4px; font-size:12px;"> <span style="font-size:11px;">Rod.</span>
                                </div>
                            </div>
                            <div class="shift-row">
                                <span style="font-size:13px; font-weight:bold; color:#0f172a; width: 60px;">🌤️ Tarde</span>
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <input type="time" id="ia-start-aft" value="14:00" style="width:90px; padding:4px; font-size:12px;">
                                    <input type="number" id="ia-r-aft" class="round-input" value="4" min="0" max="10" style="width:50px; padding:4px; font-size:12px;"> <span style="font-size:11px;">Rod.</span>
                                </div>
                            </div>
                            <div class="shift-row">
                                <span style="font-size:13px; font-weight:bold; color:#0f172a; width: 60px;">🌙 Noite</span>
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <input type="time" id="ia-start-night" value="19:00" style="width:90px; padding:4px; font-size:12px;">
                                    <input type="number" id="ia-r-night" class="round-input" value="0" min="0" max="10" style="width:50px; padding:4px; font-size:12px;"> <span style="font-size:11px;">Rod.</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 class="section-title">3. Limites e Descanso</h3>
                        <div class="form-group"><label>Descanso Mínimo (Por Atleta)</label>
                            <select id="ia-rest">
                                <option value="0">Sem restrição (Joga seguidamente se necessário)</option>
                                <option value="1" selected>1 Rodada de Descanso (Impede 2 jogos seguidos)</option>
                                <option value="2">2 Rodadas de Descanso</option>
                                <option value="3">3 Rodadas de Descanso</option>
                            </select>
                        </div>
                        <div class="form-group"><label>Máx. Jogos/Dia (Por Atleta)</label>
                            <select id="ia-max-games">
                                <option value="0">Ilimitado</option>
                                <option value="1">1 Jogo</option>
                                <option value="2" selected>2 Jogos</option>
                                <option value="3">3 Jogos</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <h3 class="section-title">4. Regras e Exceções</h3>
                        <div id="rules-container" style="margin-bottom:10px;"></div>
                        <div style="background:#f1f5f9; padding:10px; border-radius:6px; border:1px solid #cbd5e1; margin-bottom:10px; display:none;" id="rule-builder">
                            <div class="form-group"><label>Classe</label><select id="rule-class">${uniqueClasses.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div>
                            <div class="form-group"><label>Ação</label><select id="rule-type"><option value="MUST_NOT">NÃO DEVE jogar</option><option value="MUST">SÓ DEVE jogar</option></select></div>
                            <div class="form-group">
                                <label>Condição de Tempo</label>
                                <select id="rule-target">
                                    </select>
                            </div>
                            <div style="display:flex; gap:10px;">
                                <button id="btn-cancel-rule" class="btn-outline" style="flex:1;">Cancelar</button>
                                <button id="btn-save-rule" class="btn-outline" style="background:#22c55e; color:white; border-color:#16a34a; flex:1;">Adicionar</button>
                            </div>
                        </div>
                        <button id="btn-show-rule-builder" class="btn-outline" style="width:100%; border-style:dashed;">+ Adicionar Regra</button>
                    </div>

                    <button class="btn-run" id="btn-run-sim">Gerar Matriz IA ⚡</button>
                </div>

                <div class="panel preview" id="preview-area">
                    <div style="height: 100%; display: flex; flex-direction:column; align-items:center; justify-content:center; color:#94a3b8;">
                        <div style="font-size: 60px; margin-bottom:10px;">🧠</div>
                        <h2>War Room - Motor Dinâmico</h2>
                        <p>Altere o número de rodadas no painel da esquerda para ver as opções da regra a atualizar automaticamente!</p>
                        <p>Temos <strong>${state.allMatches.length}</strong> jogos fictícios vindos do Simulador.</p>
                    </div>
                </div>
            </div>
        `;

        // Ativa os listeners para o input das rodadas
        document.querySelectorAll('.round-input').forEach(el => {
            el.addEventListener('change', updateRulesDropdown);
            el.addEventListener('keyup', updateRulesDropdown); // Reage até enquanto se digita
        });
        
        // Corre a primeira vez para inicializar o dropdown corretamente
        setTimeout(() => {
            updateRulesDropdown(); 
            renderRulesList();
        }, 50);

        document.getElementById('btn-show-rule-builder').addEventListener('click', () => {
            document.getElementById('rule-builder').style.display = 'block';
            document.getElementById('btn-show-rule-builder').style.display = 'none';
        });

        document.getElementById('btn-cancel-rule').addEventListener('click', () => {
            document.getElementById('rule-builder').style.display = 'none';
            document.getElementById('btn-show-rule-builder').style.display = 'block';
        });

        document.getElementById('btn-save-rule').addEventListener('click', () => {
            state.customRules.push({
                classCode: document.getElementById('rule-class').value,
                type: document.getElementById('rule-type').value,
                target: document.getElementById('rule-target').value
            });
            renderRulesList();
            document.getElementById('rule-builder').style.display = 'none';
            document.getElementById('btn-show-rule-builder').style.display = 'block';
        });

        document.getElementById('btn-run-sim').addEventListener('click', () => {
            const config = {
                dateStart: document.getElementById('ia-start-date').value,
                dateEnd: document.getElementById('ia-end-date').value,
                timeEnd: document.getElementById('ia-time-end').value,
                courtsCount: parseInt(document.getElementById('ia-courts').value),
                
                startMorn: document.getElementById('ia-start-morn').value,
                rMorning: parseInt(document.getElementById('ia-r-morn').value) || 0,
                
                startAft: document.getElementById('ia-start-aft').value,
                rAfternoon: parseInt(document.getElementById('ia-r-aft').value) || 0,
                
                startNight: document.getElementById('ia-start-night').value,
                rNight: parseInt(document.getElementById('ia-r-night').value) || 0,
                
                restRounds: parseInt(document.getElementById('ia-rest').value), // Agora usa índice de rodadas
                maxGamesPerDay: parseInt(document.getElementById('ia-max-games').value),
            };

            if (!config.dateStart || !config.dateEnd) return alert('Selecione datas válidas!');

            const btn = document.getElementById('btn-run-sim');
            btn.innerText = "A calcular matrizes...";
            
            setTimeout(() => {
                generateSmartSchedule(config);
                btn.innerText = "Refazer Matriz ⚡";
            }, 100);
        });
    }

    function renderPreview() {
        const area = document.getElementById('preview-area');

        let statsHtml = `
            <div class="stats-box">
                <div class="stat-card">
                    <div style="font-size:24px; font-weight:900; color:#0f172a;">${state.allMatches.length}</div>
                    <div style="font-size:12px; font-weight:bold; color:#64748b;">Total de Jogos</div>
                </div>
                <div class="stat-card ${state.generatedSlots.length === state.allMatches.length ? 'success' : ''}">
                    <div style="font-size:24px; font-weight:900;">${state.generatedSlots.length}</div>
                    <div style="font-size:12px; font-weight:bold;">Encaixados</div>
                </div>
                <div class="stat-card ${state.unscheduledMatches.length > 0 ? 'danger' : ''}">
                    <div style="font-size:24px; font-weight:900;">${state.unscheduledMatches.length}</div>
                    <div style="font-size:12px; font-weight:bold;">Ficaram de Fora</div>
                </div>
            </div>
        `;

        let warningHtml = '';
        if (state.unscheduledMatches.length > 0) {
            warningHtml = `
                <div class="alert-danger">
                    ⚠️ ALERTA LOGÍSTICO: O Algoritmo não conseguiu encaixar ${state.unscheduledMatches.length} jogos respeitando as restrições e os dias definidos.<br>
                    <span style="font-size:13px; font-weight:normal; display:block; margin-top:8px;">
                    Soluções:<br>
                    - Aumente as rodadas do Turno ou o número de dias da competição.<br>
                    - Verifique se nenhuma Regra está a bloquear o fluxo todo.
                    </span>
                </div>
            `;
        }

        let gridHtml = '';
        const slotsByDay = {};
        state.generatedSlots.forEach(s => {
            if(!slotsByDay[s.date]) slotsByDay[s.date] = [];
            slotsByDay[s.date].push(s);
        });

        const totalColumns = parseInt(document.getElementById('ia-courts').value) || 4;

        Object.keys(slotsByDay).sort().forEach(date => {
            const daySlots = slotsByDay[date];
            const formattedDate = date.split('-').reverse().join('/');
            
            let minMin = 9999; let maxMin = 0;
            daySlots.forEach(s => {
                const start = s.mins; 
                const end = start + Math.max(s.match.duration, 45);
                if (start < minMin) minMin = start; 
                if (end > maxMin) maxMin = end;
            });

            const startHour = Math.floor(minMin / 60) * 60; 
            const endHour = Math.ceil(maxMin / 60) * 60;
            const pxPerMin = 2.5; 
            const totalHeight = (endHour - startHour) * pxPerMin;

            let timeAxisHtml = '';
            for (let t = startHour; t <= endHour; t += 30) {
                timeAxisHtml += `<div style="position:absolute; top:${(t - startHour) * pxPerMin}px; left:0; width:60px; text-align:center; font-size:11px; font-weight:bold; color:#1e293b; transform:translateY(-50%);">${minsToTime(t)}</div>`;
            }

            let blocksHtml = '';
            daySlots.forEach(s => {
                const classData = state.classesDataMap[s.match.class_code] || { bg: '#64748b', fg: '#ffffff' };
                let durMin = s.match.duration;
                
                const startM = s.mins;
                const topPx = (startM - startHour) * pxPerMin;
                const courtIdx = s.court - 1;

                const leftCss = `calc(60px + (${courtIdx} / ${totalColumns}) * (100% - 60px))`;
                const widthCss = `calc((100% - 60px) / ${totalColumns})`;

                const m = s.match;
                let titleStr = m.meta?.group ? `Grupo ${m.meta.group}` : (m.meta?.fase || 'Fase Final');
                if (m.meta?.round) titleStr += ` • Rodada ${m.meta.round}`;
                if (m.match_type !== 'GROUP') titleStr = m.label || m.meta?.fase;

                blocksHtml += `
                    <div style="position:absolute; top:${topPx}px; left:${leftCss}; width:${widthCss}; min-height:80px; height:${Math.max(durMin * pxPerMin, 80)}px; padding: 2px; box-sizing: border-box; z-index: 5;">
                        <div style="background:${classData.bg}; color:${classData.fg}; width:100%; height:100%; border-radius: 6px; border: 1px solid #000; display: flex; flex-direction: column; padding: 6px; box-sizing: border-box; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.2); line-height: 1.1; text-align: center; justify-content: center;">
                            <div style="font-weight: 900; font-size: 11px; border-bottom: 1px solid rgba(255,255,255,0.4); margin-bottom: 4px; padding-bottom: 4px;">${s.time} • ${escapeHTML(m.class_code)}</div>
                            <div style="font-weight:bold; font-size:9px; background:rgba(0,0,0,0.2); margin-bottom:2px; padding:1px; border-radius:2px;">${escapeHTML(titleStr)}</div>
                            <div style="display: flex; flex-direction: column; gap: 2px; flex: 1; justify-content: center;">
                                <div style="font-size: 10px; font-weight: 800; word-break: break-word; line-height: 1.1;">${escapeHTML(m.p1Name)}</div>
                                <div style="font-size:8px; font-weight:bold; opacity:0.8; margin:1px 0;">VS</div>
                                <div style="font-size: 10px; font-weight: 800; word-break: break-word; line-height: 1.1;">${escapeHTML(m.p2Name)}</div>
                            </div>
                        </div>
                    </div>
                `;
            });

            let bgCols = `<div style="width: 60px; border-right: 2px solid #000; background: #f1f5f9; flex-shrink: 0; box-sizing:border-box;"></div>`;
            for(let i=0; i<totalColumns; i++) {
                bgCols += `<div style="flex:1; border-right: 1px solid #cbd5e1; box-sizing:border-box;"></div>`;
            }

            gridHtml += `
              <div style="margin-bottom: 40px; background:#fff; border:2px solid #000; border-radius:4px; overflow:hidden; font-family:sans-serif;">
                  <div style="background:#0f172a; color:white; padding:8px 15px; font-weight:bold; display:flex; justify-content:space-between;">
                      <span>Grelha da IA</span>
                      <span>Data: ${formattedDate}</span>
                  </div>
                  <div style="display: flex; background: #0f172a; color: white; border-bottom: 2px solid #000;">
                     <div style="width: 60px; border-right: 2px solid #000; flex-shrink: 0; background: #0f172a;"></div>
                     ${Array.from({length: totalColumns}).map((_,i) => `<div style="flex:1; text-align:center; padding:10px 4px; border-right: 1px solid #334155; font-size:11px; font-weight:bold; display:flex; align-items:center; justify-content:center;">Quadra ${i+1}</div>`).join('')}
                  </div>
                  <div style="position: relative; min-height: ${totalHeight + 30}px;">
                      <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex;">
                          ${bgCols}
                      </div>
                      <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent ${(30*pxPerMin)-1}px, #cbd5e1 ${(30*pxPerMin)-1}px, #cbd5e1 ${30*pxPerMin}px); pointer-events: none;"></div>
                      ${timeAxisHtml}
                      ${blocksHtml}
                  </div>
              </div>
            `;
        });

        let saveBtnHtml = state.generatedSlots.length > 0 ? `<button class="btn-save" id="btn-export-sim">📥 TRANSFERIR MATRIZ PARA O SIMULADOR VISUAL</button>` : '';

        area.innerHTML = `
            ${statsHtml}
            ${warningHtml}
            ${saveBtnHtml}
            <h3 style="margin-top:20px; padding-top:20px; border-top:2px solid #e2e8f0; font-family:sans-serif;">Resultado do Algoritmo</h3>
            ${gridHtml}
        `;

        const btnExport = document.getElementById('btn-export-sim');
        if (btnExport) {
            btnExport.addEventListener('click', () => {
                let newAllocations = [];
                state.generatedSlots.forEach(s => {
                    newAllocations.push({
                        id: s.match.id,
                        label: s.match.label,
                        details: s.match.details,
                        classCode: s.match.class_code,
                        duration: getMatchDur(s.match.class_code),
                        meta: s.match.meta,
                        court: s.court,
                        start: s.mins,
                        date: s.date
                    });
                });

                draftState.allocations = newAllocations;
                sessionStorage.setItem('simulador_draft_data', JSON.stringify(draftState));
                
                window.location.hash = '#/simulador';
            });
        }
    }

    init();
}