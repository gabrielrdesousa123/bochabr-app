// client/js/pages/system-logs.js

import { db } from '../firebase-config.js';
import { collection, getDocs, getDoc, doc, query, orderBy, writeBatch, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { logAction } from '../logger.js';

export async function renderSystemLogs(root) {
    const auth = getAuth();
    // Usando <\/div> para evitar bugs de parser JSX/TSX no editor
    root.innerHTML = '<div style="padding: 50px; text-align: center;">A verificar credenciais de segurança...<\/div>';

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            root.innerHTML = '<div style="padding:50px; color:red; text-align:center; font-weight:bold;">Acesso Negado. Autenticação necessária.<\/div>';
            return;
        }

        let isAdmin = false;
        try {
            const uDoc = await getDoc(doc(db, "users", user.uid));
            if (uDoc.exists()) {
                const uData = uDoc.data();
                const role = String(uData.global_role || uData.role || '').toUpperCase();
                if (role.includes('ADMIN')) isAdmin = true;
            }
        } catch (e) {}

        if (!isAdmin) {
            root.innerHTML = '<div style="padding:50px; color:red; text-align:center; font-weight:bold;">Acesso Restrito. Apenas administradores globais podem ver os logs do sistema.<\/div>';
            await logAction("TENTATIVA DE ACESSO NEGADA à página de Logs do Sistema.", "SISTEMA");
            return;
        }

        await logAction("Acedeu à página de Logs do Sistema.", "SISTEMA");
        loadAndRenderLogs(root);
    });
}

async function loadAndRenderLogs(root) {
    root.innerHTML = '<div style="padding: 50px; text-align: center;">A extrair logs do sistema...<\/div>';

    let logsDocs = [];
    let allLogs = [];

    try {
        const q = query(collection(db, "system_logs"), orderBy("timestamp", "desc"), limit(1000));
        const snap = await getDocs(q);
        snap.forEach(d => {
            logsDocs.push(d.ref);
            allLogs.push({
                ref: d.ref,
                log_line: d.data().log_line || '',
                entity: d.data().entity || 'SISTEMA',
                action: d.data().action || '',
                user_name: d.data().user_name || '-',
                timestamp: d.data().timestamp
            });
        });
    } catch (e) {
        console.error("Erro ao carregar logs:", e);
    }

    let existingStyle = document.getElementById('log-page-style');
    if (existingStyle) existingStyle.remove();

    const styleEl = document.createElement('style');
    styleEl.id = 'log-page-style';
    styleEl.textContent = `
        .log-container { max-width: 1400px; margin: 0 auto; padding: 20px; font-family: sans-serif; background: #ffffff; }
        .log-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 20px; flex-wrap: wrap; gap: 10px; }
        .log-filters { display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; align-items: center; }
        .log-filter-input { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; outline: none; color: #000; background: #fff; }
        .log-filter-input:focus { border-color: #94a3b8; }
        .log-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .log-table th { background: #f8fafc; padding: 10px 12px; text-align: left; border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: bold; white-space: nowrap; }
        .log-table td { padding: 9px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; color: #000; }
        .log-table tr:hover td { background: #f8fafc; }
        .entity-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; white-space: nowrap; }
        .badge-SISTEMA    { background: #e2e8f0; color: #475569; }
        .badge-CLUBE      { background: #dbeafe; color: #1d4ed8; }
        .badge-ATLETA     { background: #dcfce7; color: #15803d; }
        .badge-CLASSE     { background: #fef9c3; color: #a16207; }
        .badge-COMPETICAO { background: #ede9fe; color: #6d28d9; }
        .badge-COMPETIÇÃO { background: #ede9fe; color: #6d28d9; }
        .badge-UTILIZADOR { background: #fce7f3; color: #be185d; }
        .badge-default    { background: #f1f5f9; color: #334155; }
        .log-count { font-size: 13px; color: #64748b; margin-bottom: 10px; }
        .btn-action { padding: 9px 18px; border-radius: 6px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 13px; transition: background 0.2s; }
        .btn-download { background: #fff; color: #000; border: 1px solid #cbd5e1; }
        .btn-download:hover { background: #f1f5f9; }
        .btn-clear { background: #fff; color: #ef4444; border: 1px solid #fca5a5; }
        .btn-clear:hover { background: #fef2f2; }
        .table-wrapper { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px; }
    `;
    document.head.appendChild(styleEl);

    root.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'log-container';
    root.appendChild(container);

    const header = document.createElement('div');
    header.className = 'log-header';

    const titleDiv = document.createElement('div');
    const h1 = document.createElement('h1');
    h1.style.cssText = 'margin: 0; font-size: 22px; color: #000;';
    h1.textContent = '🛡️ Auditoria e Logs do Sistema';
    const subtitle = document.createElement('p');
    subtitle.style.cssText = 'margin: 4px 0 0 0; color: #475569; font-size: 13px;';
    subtitle.textContent = 'Registo de atividades, acessos e modificações. Exibindo os últimos 1000 registos.';
    titleDiv.appendChild(h1);
    titleDiv.appendChild(subtitle);

    const btnDiv = document.createElement('div');
    btnDiv.style.cssText = 'display: flex; gap: 10px;';

    const btnSave = document.createElement('button');
    btnSave.id = 'btn-save-log';
    btnSave.className = 'btn-action btn-download';
    btnSave.textContent = '💾 Exportar (.txt)';

    const btnClear = document.createElement('button');
    btnClear.id = 'btn-clear-log';
    btnClear.className = 'btn-action btn-clear';
    btnClear.textContent = '🗑️ Limpar Logs';

    btnDiv.appendChild(btnSave);
    btnDiv.appendChild(btnClear);
    header.appendChild(titleDiv);
    header.appendChild(btnDiv);
    container.appendChild(header);

    const filtersDiv = document.createElement('div');
    filtersDiv.className = 'log-filters';

    const inputSearch = document.createElement('input');
    inputSearch.type = 'text';
    inputSearch.id = 'filter-search';
    inputSearch.className = 'log-filter-input';
    inputSearch.placeholder = '🔍 Pesquisar em todos os campos...';
    inputSearch.style.minWidth = '260px';

    const entities = ['TODOS', ...new Set(allLogs.map(l => l.entity))].sort();
    const selectEntity = document.createElement('select');
    selectEntity.id = 'filter-entity';
    selectEntity.className = 'log-filter-input';
    entities.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e;
        opt.textContent = e;
        selectEntity.appendChild(opt);
    });

    const inputDate = document.createElement('input');
    inputDate.type = 'date';
    inputDate.id = 'filter-date';
    inputDate.className = 'log-filter-input';

    const btnClearFilters = document.createElement('button');
    btnClearFilters.id = 'btn-clear-filters';
    btnClearFilters.className = 'btn-action btn-download';
    btnClearFilters.style.cssText = 'padding: 8px 14px; font-size: 12px;';
    btnClearFilters.textContent = '✕ Limpar Filtros';

    filtersDiv.appendChild(inputSearch);
    filtersDiv.appendChild(selectEntity);
    filtersDiv.appendChild(inputDate);
    filtersDiv.appendChild(btnClearFilters);
    container.appendChild(filtersDiv);

    const countDiv = document.createElement('div');
    countDiv.id = 'log-count';
    countDiv.className = 'log-count';
    container.appendChild(countDiv);

    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'table-wrapper';

    const table = document.createElement('table');
    table.className = 'log-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Data/Hora', 'Entidade', 'Ação / Detalhe', 'Utilizador'].forEach((text, i) => {
        const th = document.createElement('th');
        th.textContent = text;
        if (i === 0) th.style.width = '170px';
        if (i === 1) th.style.width = '120px';
        if (i === 3) th.style.width = '200px';
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    tbody.id = 'log-tbody';
    table.appendChild(tbody);
    tableWrapper.appendChild(table);
    container.appendChild(tableWrapper);

    function getBadgeClass(entity) {
        const map = {
            'SISTEMA':    'badge-SISTEMA',
            'CLUBE':      'badge-CLUBE',
            'ATLETA':     'badge-ATLETA',
            'CLASSE':     'badge-CLASSE',
            'COMPETICAO': 'badge-COMPETICAO',
            'COMPETIÇÃO': 'badge-COMPETICAO',
            'UTILIZADOR': 'badge-UTILIZADOR'
        };
        return map[entity] || 'badge-default';
    }

    function parseDateTime(logLine) {
        // Usando new RegExp para evitar bugs de parser do VS Code
        const rx = new RegExp("^\|$([^\$|]+)\$|");
        const match = logLine.match(rx);
        return match ? match[1] : '-';
    }

    function parseActionText(logLine) {
        // Usando new RegExp para evitar bugs de parser do VS Code
        const rx1 = new RegExp("^\|$([^\$|]+)\$|\\s*");
        const rx2 = new RegExp("\\|\\s*Utilizador:.*$");
        return logLine
            .replace(rx1, '')
            .replace(rx1, '')
            .replace(rx2, '')
            .trim();
    }

    function renderTable(filtered) {
        const tbd = document.getElementById('log-tbody');
        const cntEl = document.getElementById('log-count');
        if (!tbd) return;

        cntEl.textContent = filtered.length + ' registo(s) encontrado(s) de ' + allLogs.length + ' total.';
        tbd.innerHTML = '';

        if (filtered.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 4;
            td.style.cssText = 'text-align:center; padding:30px; color:#94a3b8;';
            td.textContent = 'Nenhum registo encontrado com os filtros aplicados.';
            tr.appendChild(td);
            tbd.appendChild(tr);
            return;
        }

        filtered.forEach(log => {
            const tr = document.createElement('tr');

            const tdDate = document.createElement('td');
            tdDate.style.cssText = 'font-size:12px; color:#475569; white-space:nowrap;';
            tdDate.textContent = parseDateTime(log.log_line);

            const tdEntity = document.createElement('td');
            const badge = document.createElement('span');
            badge.className = 'entity-badge ' + getBadgeClass(log.entity);
            badge.textContent = log.entity;
            tdEntity.appendChild(badge);

            const tdAction = document.createElement('td');
            tdAction.style.cssText = 'font-size:12px; line-height:1.5;';
            tdAction.textContent = parseActionText(log.log_line);

            const tdUser = document.createElement('td');
            tdUser.style.cssText = 'font-size:12px; color:#475569;';
            tdUser.textContent = log.user_name;

            tr.appendChild(tdDate);
            tr.appendChild(tdEntity);
            tr.appendChild(tdAction);
            tr.appendChild(tdUser);
            tbd.appendChild(tr);
        });
    }

    function applyFilters() {
        const search = (document.getElementById('filter-search').value || '').toLowerCase();
        const entity = document.getElementById('filter-entity').value || 'TODOS';
        const dateInput = document.getElementById('filter-date').value || '';

        let formattedDate = '';
        if (dateInput) {
            const [y, m, d] = dateInput.split('-');
            formattedDate = `${d}/${m}/${y}`;
        }

        const filtered = allLogs.filter(log => {
            const matchSearch = !search || log.log_line.toLowerCase().includes(search) || log.user_name.toLowerCase().includes(search);
            const matchEntity = entity === 'TODOS' || log.entity === entity || (entity === 'COMPETICAO' && log.entity === 'COMPETIÇÃO');
            const matchDate   = !formattedDate || log.log_line.includes(formattedDate);

            return matchSearch && matchEntity && matchDate;
        });

        renderTable(filtered);
    }

    renderTable(allLogs);

    document.getElementById('filter-search').addEventListener('input', applyFilters);
    document.getElementById('filter-entity').addEventListener('change', applyFilters);
    document.getElementById('filter-date').addEventListener('change', applyFilters);
    document.getElementById('btn-clear-filters').addEventListener('click', () => {
        document.getElementById('filter-search').value = '';
        document.getElementById('filter-entity').value = 'TODOS';
        document.getElementById('filter-date').value = '';
        renderTable(allLogs);
    });

    document.getElementById('btn-save-log').addEventListener('click', () => {
        const text = allLogs.map(l => l.log_line).join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'system_log_' + new Date().toISOString().split('T')[0] + '.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    document.getElementById('btn-clear-log').addEventListener('click', async () => {
        if (!confirm("⚠️ ATENÇÃO: Tem a certeza que deseja APAGAR TODOS os registos permanentemente?\nRecomenda-se exportar antes.")) return;

        const btn = document.getElementById('btn-clear-log');
        btn.textContent = "A limpar...";
        btn.disabled = true;

        try {
            const chunkSize = 500;
            for (let i = 0; i < logsDocs.length; i += chunkSize) {
                const batch = writeBatch(db);
                logsDocs.slice(i, i + chunkSize).forEach(ref => batch.delete(ref));
                await batch.commit();
            }
            await logAction("Administrador limpou o histórico de logs.", "SISTEMA");
            alert("Logs limpos com sucesso!");
            loadAndRenderLogs(root);
        } catch (e) {
            alert("Erro ao limpar logs: " + e.message);
            btn.textContent = "🗑️ Limpar Logs";
            btn.disabled = false;
        }
    });
}