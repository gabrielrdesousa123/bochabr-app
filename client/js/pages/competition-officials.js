// client/js/pages/competition-officials.js

import { db } from '../firebase-config.js';
import { collection, getDocs, getDoc, doc, setDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function renderCompetitionOfficials(root, hashData) {
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
    competitionOfficials: [], 
    globalReferees: []       
  };

  const ROLES = [
    'Delegado Técnico', 
    'Assistente Delegado Técnico', 
    'Árbitro chefe', 
    'Assistente Árbitro Chefe', 
    'Árbitro', 
    'Cursista'
  ];

  const ROLE_WEIGHTS = {
    'Delegado Técnico': 1,
    'Assistente Delegado Técnico': 2,
    'Árbitro chefe': 3,
    'Assistente Árbitro Chefe': 4,
    'Árbitro': 5,
    'Cursista': 6
  };

  const API = {
    getCompetition: async (id) => {
      try {
        const docRef = doc(db, "competitions", String(id));
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : { name: 'Competição' };
      } catch(e) { return { name: 'Competição' }; }
    },
    getCompOfficials: async (id) => {
      try {
        const q = query(collection(db, "competition_officials"), where("competition_id", "==", String(id)));
        const snap = await getDocs(q);
        if (!snap.empty) {
            return snap.docs[0].data().officials || [];
        }
        return [];
      } catch(e) { return []; }
    },
    getGlobalReferees: async () => {
      try {
        const snap = await getDocs(collection(db, "referees"));
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch(e) { return []; }
    },
    addOfficial: async (referee_id, role) => {
      try {
         // Pega os dados do árbitro global
         const refRef = doc(db, "referees", String(referee_id));
         const refSnap = await getDoc(refRef);
         if (!refSnap.exists()) throw new Error("Oficial global não encontrado no banco.");
         
         const refData = refSnap.data();
         const newOfficial = {
             bond_id: Date.now().toString(), // ID falso para exclusão local
             referee_id: referee_id,
             role: role,
             nome_completo: refData.nome || refData.nome_completo,
             nome_abreviado: refData.nome_abreviado || refData.nome,
             uf: refData.uf || refData.estado || '',
             nivel: refData.nivel || 'N/A'
         };

         const q = query(collection(db, "competition_officials"), where("competition_id", "==", String(competitionId)));
         const snap = await getDocs(q);
         
         if (!snap.empty) {
             const docId = snap.docs[0].id;
             let officials = snap.docs[0].data().officials || [];
             
             // Evita duplicidade da mesma pessoa na mesma função
             if(officials.some(o => o.referee_id === referee_id && o.role === role)) {
                 throw new Error("Este oficial já está na competição com esta mesma função.");
             }
             
             officials.push(newOfficial);
             await setDoc(doc(db, "competition_officials", docId), { officials }, { merge: true });
         } else {
             // Cria o primeiro
             await setDoc(doc(collection(db, "competition_officials")), {
                 competition_id: String(competitionId),
                 officials: [newOfficial]
             });
         }
      } catch (e) {
         throw new Error("Erro ao gravar vínculo no Firebase: " + e.message);
      }
    },
    removeOfficial: async (bondId) => {
      try {
         const q = query(collection(db, "competition_officials"), where("competition_id", "==", String(competitionId)));
         const snap = await getDocs(q);
         if (!snap.empty) {
             const docId = snap.docs[0].id;
             let officials = snap.docs[0].data().officials || [];
             officials = officials.filter(o => o.bond_id !== bondId);
             await setDoc(doc(db, "competition_officials", docId), { officials }, { merge: true });
         }
      } catch (e) {
         throw new Error("Erro ao remover o oficial do Firebase.");
      }
    }
  };

  async function loadData() {
    try {
      const [compData, compOff, glRef] = await Promise.all([
        API.getCompetition(competitionId),
        API.getCompOfficials(competitionId),
        API.getGlobalReferees()
      ]);
      
      state.competitionName = compData.name || compData.nome || 'Competição';
      
      state.competitionOfficials = (compOff || []).sort((a, b) => {
         const weightA = ROLE_WEIGHTS[a.role] || 99;
         const weightB = ROLE_WEIGHTS[b.role] || 99;
         if (weightA !== weightB) return weightA - weightB;
         return (a.nome_completo || '').localeCompare(b.nome_completo || '');
      });

      state.globalReferees = glRef;
      
      render();
    } catch (e) {
      console.error(e);
      root.innerHTML = `<div class="alert alert-danger" style="margin:20px; padding:20px;">Erro de conexão.</div>`;
    }
  }

  function escapeHTML(str) {
    if (!str) return '-';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function render() {
    const tableBody = state.competitionOfficials.length === 0 
      ? `<tr><td colspan="5" style="text-align:center; padding: 40px; color:#64748b;">Nenhum oficial designado ainda. Clique em "Adicionar Oficial" acima.</td></tr>`
      : state.competitionOfficials.map(o => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 12px 15px; font-weight: 600; color: #1e293b;">${escapeHTML(o.nome_completo)}</td>
          <td style="padding: 12px 15px; color: #475569;">${escapeHTML(o.nome_abreviado)}</td>
          <td style="padding: 12px 15px; color: #475569;">${escapeHTML(o.uf)} <span style="font-size:11px; color:#94a3b8;">(${escapeHTML(o.nivel)})</span></td>
          <td style="padding: 12px 15px;"><span style="background: #eff6ff; color: #1d4ed8; padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; border: 1px solid #bfdbfe;">${escapeHTML(o.role)}</span></td>
          <td style="padding: 12px 15px; text-align: center;"><button class="btn-del-official" data-bond="${o.bond_id}" style="background: none; border: none; color: #ef4444; font-size: 20px; font-weight: bold; cursor: pointer;" title="Remover da Competição">&times;</button></td>
        </tr>
      `).join('');

    const styles = `
      <style>
        .wb-container { max-width: 1000px; margin: 0 auto; padding: 20px; font-family: sans-serif; }
        .wb-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
        .btn-outline-secondary { border: 1px solid #cbd5e1; background: white; color: #475569; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500; transition: all 0.2s; }
        .btn-outline-secondary:hover { background: #f1f5f9; color: #0f172a; }
        .btn-primary { background: #0d6efd; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; transition: all 0.2s; font-size: 14px; }
        .btn-primary:hover { background: #0b5ed7; }
        
        .wb-table { width: 100%; border-collapse: collapse; font-size: 14px; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
        .wb-table th { background: #f8fafc; color: #475569; font-weight: 600; text-transform: uppercase; font-size: 12px; padding: 14px 15px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        .wb-table tr:hover { background: #f8fafc; }

        /* MODAL BACKDROP */
        .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: none; justify-content: center; align-items: center; z-index: 1000; }
        .modal-overlay.active { display: flex; }
        .modal-content { background: white; width: 100%; max-width: 600px; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); overflow: hidden; display: flex; flex-direction: column; max-height: 85vh; }
        .modal-header { padding: 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
        .modal-body { padding: 20px; overflow-y: auto; }
        
        .official-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: background 0.2s; }
        .official-card:hover { background: #f8fafc; border-color: #94a3b8; }
        .official-card.selected { background: #eff6ff; border-color: #3b82f6; border-width: 2px; padding: 13px; }
        
        .role-panel { display: none; margin-top: 15px; padding-top: 15px; border-top: 1px dashed #cbd5e1; }
        .role-panel.active { display: block; animation: fadeIn 0.3s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
      </style>
    `;

    root.innerHTML = `
      ${styles}
      <div class="wb-container">
        <div class="wb-header">
          <div>
            <h1 style="margin: 0; font-size: 26px; color: #0f172a;">Equipa de Arbitragem</h1>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px;">${escapeHTML(state.competitionName)}</p>
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn-primary" id="btn-open-modal">+ Adicionar Oficial</button>
            <button class="btn-outline-secondary" onclick="window.history.back()">← Voltar ao Dashboard</button>
          </div>
        </div>

        <table class="wb-table">
          <thead>
            <tr>
              <th>Nome Completo</th>
              <th>Nome Abreviado</th>
              <th>Origem (Nível)</th>
              <th>Função na Competição</th>
              <th style="text-align: center; width: 80px;">Ação</th>
            </tr>
          </thead>
          <tbody>${tableBody}</tbody>
        </table>
      </div>

      <div class="modal-overlay" id="add-official-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3 style="margin:0; font-size:18px; color:#0f172a;">Vincular Oficial à Competição</h3>
            <button id="btn-close-modal" style="background:none; border:none; font-size:28px; cursor:pointer; color:#64748b; line-height: 1;">&times;</button>
          </div>
          <div class="modal-body">
            <p style="color: #64748b; font-size: 14px; margin-top: 0; margin-bottom: 15px;">1. Selecione um oficial da base global:</p>
            
            <div style="max-height: 280px; overflow-y: auto; margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; background: #f8fafc;">
              ${state.globalReferees.length === 0 ? '<p style="text-align:center; color:#94a3b8; padding: 20px;">Nenhum árbitro cadastrado no sistema global.</p>' : ''}
              ${state.globalReferees.map(r => `
                <div class="official-card" data-refid="${r.id}">
                  <div>
                    <div style="font-weight: 600; font-size: 15px; color: #1e293b;">${escapeHTML(r.nome_completo || r.nome)}</div>
                    <div style="font-size: 12px; color: #64748b; margin-top: 4px;">${escapeHTML(r.uf || r.estado)} | <span style="font-weight: bold;">${escapeHTML(r.nivel || 'N/A')}</span></div>
                  </div>
                  <div style="color: #3b82f6; font-size: 20px; display: none; font-weight: bold;" class="check-icon">✓</div>
                </div>
              `).join('')}
            </div>

            <div class="role-panel" id="role-panel">
              <label style="font-weight: bold; font-size: 14px; color: #1e293b; display: block; margin-bottom: 10px;">2. Definir Função:</label>
              <select id="role-select" style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 6px; margin-bottom: 20px; font-size: 15px;">
                <option value="">-- Escolha uma função na lista --</option>
                ${ROLES.map(r => `<option value="${r}">${r}</option>`).join('')}
              </select>
              
              <button class="btn-primary" id="btn-confirm-link" style="width: 100%; padding: 14px; font-size: 16px;">Gravar Vínculo</button>
            </div>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    const modal = document.getElementById('add-official-modal');
    const rolePanel = document.getElementById('role-panel');
    let selectedRefereeId = null;

    document.getElementById('btn-open-modal').onclick = () => modal.classList.add('active');
    document.getElementById('btn-close-modal').onclick = () => {
        modal.classList.remove('active');
        selectedRefereeId = null;
        rolePanel.classList.remove('active');
        document.getElementById('role-select').value = "";
        document.querySelectorAll('.official-card').forEach(c => c.classList.remove('selected'));
    };

    document.querySelectorAll('.official-card').forEach(card => {
      card.onclick = () => {
        document.querySelectorAll('.official-card').forEach(c => {
            c.classList.remove('selected');
            c.querySelector('.check-icon').style.display = 'none';
        });
        card.classList.add('selected');
        card.querySelector('.check-icon').style.display = 'block';
        
        selectedRefereeId = card.dataset.refid;
        rolePanel.classList.add('active');
        
        rolePanel.scrollIntoView({ behavior: 'smooth', block: 'end' });
      };
    });

    const btnConfirm = document.getElementById('btn-confirm-link');
    btnConfirm.onclick = async () => {
      const role = document.getElementById('role-select').value;
      if (!selectedRefereeId || !role) return alert("Selecione um oficial na lista e defina a sua função!");
      
      btnConfirm.disabled = true;
      btnConfirm.textContent = "A gravar...";
      
      try {
        await API.addOfficial(selectedRefereeId, role);
        modal.classList.remove('active');
        await loadData();
      } catch (e) { 
        alert(e.message || "Erro ao gravar. Verifique o servidor."); 
        btnConfirm.disabled = false;
        btnConfirm.textContent = "Gravar Vínculo";
      }
    };

    document.querySelectorAll('.btn-del-official').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm("Remover este oficial desta competição? (Isso não o apaga do sistema global)")) return;
        try {
          await API.removeOfficial(btn.dataset.bond);
          await loadData();
        } catch (e) { alert(e.message); }
      };
    });
  }

  loadData();
}