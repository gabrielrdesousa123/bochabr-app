// client/js/pages/status.js

import { db } from '../firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 🔥 É ESSA FUNÇÃO AQUI (renderStatus) QUE O MAIN.JS ESTAVA PROCURANDO!
export async function renderStatus(root) {
    root.innerHTML = `
        <section class="page" style="padding: 20px; font-family: sans-serif;">
            <header class="toolbar" style="margin-bottom: 20px;">
                <h1 style="color: #0f172a; margin:0;">Status do Sistema</h1>
            </header>
            <div class="card" style="margin-top:20px; padding:20px; background: white; border: 1px solid #cbd5e1; border-radius: 8px;">
                <p style="color: #64748b;">Verificando conexão com o banco de dados Firebase...</p>
                <div id="status-results" style="margin-top: 15px; padding: 15px; background: #f8fafc; border-radius: 6px;">
                    <div style="width:24px; height:24px; border:3px solid #cbd5e1; border-top:3px solid #3b82f6; border-radius:50%; animation:spin 1s linear infinite;"></div>
                </div>
            </div>
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
        </section>
    `;
    
    const res = root.querySelector('#status-results');
    try {
        const snap = await getDocs(collection(db, "classes"));
        res.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 24px;">✅</span>
                <div>
                    <strong style="color: #16a34a; font-size: 16px;">Conexão OK!</strong><br>
                    <span style="color: #475569; font-size: 13px;">O banco de dados está online e respondendo rapidamente. (${snap.size} classes carregadas).</span>
                </div>
            </div>
        `;
    } catch (e) {
        res.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 24px;">❌</span>
                <div>
                    <strong style="color: #dc2626; font-size: 16px;">Erro de Conexão</strong><br>
                    <span style="color: #475569; font-size: 13px;">${e.message}</span>
                </div>
            </div>
        `;
    }
}