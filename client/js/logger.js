// client/js/logger.js

import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

function getBrasiliaTime() {
    return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/**
 * @param {string} action - Descrição da ação
 * @param {string} entity - Entidade afetada: 'CLUBE', 'ATLETA', 'CLASSE', 'COMPETIÇÃO', etc.
 * @param {object} details - Dados extras: { id, nome, campo, valorAntigo, valorNovo }
 */
export async function logAction(action, entity = 'SISTEMA', details = {}) {
    try {
        const auth = getAuth();
        const user = auth.currentUser;

        const userName = user?.displayName || user?.email || 'Utilizador Desconhecido';
        const userId = user?.uid || 'N/A';
        const time = getBrasiliaTime();

        let detailStr = '';
        if (details.nome)        detailStr += ` | Nome: "${details.nome}"`;
        if (details.id)          detailStr += ` | ID: ${details.id}`;
        if (details.campo)       detailStr += ` | Campo: "${details.campo}"`;
        if (details.valorAntigo !== undefined) detailStr += ` | De: "${details.valorAntigo}"`;
        if (details.valorNovo !== undefined)   detailStr += ` | Para: "${details.valorNovo}"`;

        const log_line = `[${time}] [${entity}] ${action}${detailStr} | Utilizador: ${userName} (UID: ${userId})`;

        await addDoc(collection(db, "system_logs"), {
            log_line,
            action,
            entity,
            details,
            user_id: userId,
            user_name: userName,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.warn("Falha ao registar log:", e.message);
    }
}