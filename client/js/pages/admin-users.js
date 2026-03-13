// client/js/pages/admin-users.js

import { db } from '../firebase-config.js';
import { collection, getDocs, doc, updateDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { canViewPage } from '../permissions.js';

export async function renderAdminUsers(root) {
  if (!canViewPage('gestao')) {
      root.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444; font-weight: bold;">
        Acesso Negado. Você não tem permissão para gerir utilizadores.
      </div>`;
      return;
  }

  root.innerHTML = `<div style="padding: 40px; text-align: center;">Carregando usuários...</div>`;

  let refereesList = [];
  let usersList = [];

  async function loadData() {
    try {
      // 1. Busca os Usuários (Logins)
      const snapUsers = await getDocs(collection(db, "users"));
      usersList = snapUsers.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // 2. Busca os Oficiais (Árbitros cadastrados no sistema)
      const snapRefs = await getDocs(collection(db, "referees"));
      refereesList = snapRefs.docs.map(d => ({ id: d.id, ...d.data() }));

      // Ordena usuários: Pendentes primeiro
      usersList.sort((a, b) => {
          if (a.status === 'pending' && b.status !== 'pending') return -1;
          if (a.status !== 'pending' && b.status === 'pending') return 1;
          return (a.nome_completo || '').localeCompare(b.nome_completo || '');
      });

      // Ordena oficiais alfabeticamente para o Dropdown
      refereesList.sort((a, b) => (a.nome_completo || '').localeCompare(b.nome_completo || ''));

      render();
    } catch (e) {
      root.innerHTML = `<div class="alert alert-danger" style="margin:20px; padding:20px; background:#fee2e2; color:#b91c1c;">Erro ao buscar dados. Você tem permissão de Admin?</div>`;
    }
  }

  function render() {
    const accessOptions = [
        { val: 'USER_1', label: 'Usuário (Apenas Leitura)' },
        { val: 'ADMIN_2', label: 'Admin II (Competição/Cadastro)' },
        { val: 'ADMIN_1', label: 'Admin I (Quase Tudo)' },
        { val: 'ADMIN_GERAL', label: 'Admin Total' }
    ];

    const rows = usersList.map(u => {
      const isPending = u.status === 'pending';
      const statusBadge = isPending 
        ? `<span style="background:#fef08a; color:#854d0e; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:bold;">Aguardando</span>`
        : u.status === 'approved' 
          ? `<span style="background:#dcfce7; color:#166534; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:bold;">Aprovado</span>`
          : `<span style="background:#fee2e2; color:#b91c1c; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:bold;">Negado</span>`;

      const currentAccess = u.global_role || 'USER_1';
      const linkedRefId = u.referee_id || ''; // Vê se já está ligado a um oficial

      // 🔥 Monta as opções de Oficiais (Fictícios ou já vinculados)
      let refOptionsHTML = `<option value="NONE" ${!linkedRefId ? 'selected' : ''}>Nenhum (Não é árbitro)</option>`;
      refOptionsHTML += `<option value="CREATE_NEW" style="font-weight:bold; color:#16a34a;">➕ Criar Novo Oficial</option>`;
      
      refereesList.forEach(ref => {
          // Destaca se o oficial já está vinculado a este usuário
          const isSelected = linkedRefId === ref.id ? 'selected' : '';
          // Se o oficial já está vinculado a OUTRO usuário, a gente avisa
          const isTaken = ref.uid && ref.uid !== u.id ? ' (Já vinculado)' : '';
          refOptionsHTML += `<option value="${ref.id}" ${isSelected} ${isTaken ? 'disabled' : ''}>${ref.nome_completo}${isTaken}</option>`;
      });

      return `
        <tr style="border-bottom: 1px solid #eee; background: ${isPending ? '#fffbeb' : '#fff'};">
          <td style="padding: 12px;">
            <strong>${u.nome_completo || 'Sem Nome'}</strong><br>
            <small style="color:#64748b;">${u.email || 'Sem Email'} | UF: ${u.uf || '-'}</small>
          </td>
          <td style="padding: 12px; text-align: center;">${statusBadge}</td>
          
          <td style="padding: 12px;">
             <select class="global-role-sel form-select form-select-sm" data-uid="${u.id}" style="width: 100%; padding:6px; border-radius:6px; border:1px solid #cbd5e1; font-size:13px; font-weight:bold; color:#0f172a;">
                ${accessOptions.map(r => `<option value="${r.val}" ${currentAccess === r.val ? 'selected' : ''}>${r.label}</option>`).join('')}
             </select>
          </td>

          <td style="padding: 12px;">
             <select class="ref-link-sel form-select form-select-sm" data-uid="${u.id}" style="width: 100%; padding:6px; border-radius:6px; border:1px solid #cbd5e1; font-size:13px;">
                ${refOptionsHTML}
             </select>
             ${linkedRefId ? `<div style="font-size:10px; color:#16a34a; margin-top:2px;">✓ Vinculado</div>` : ''}
          </td>

          <td style="padding: 12px; text-align: right; white-space: nowrap;">
            ${isPending ? `
              <button class="btn btn-sm btn-approve" data-uid="${u.id}" style="background:#16a34a; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">Aprovar</button>
              <button class="btn btn-sm btn-deny" data-uid="${u.id}" style="background:#ef4444; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">Negar</button>
            ` : `
              <button class="btn btn-sm btn-save-role" data-uid="${u.id}" style="background:#3b82f6; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; margin-right:4px;">💾 Salvar</button>
              ${u.status === 'approved' 
                ? `<button class="btn btn-sm btn-deny" data-uid="${u.id}" style="background:transparent; border:1px solid #ef4444; color:#ef4444; padding:5px 10px; border-radius:4px; cursor:pointer;">Suspender</button>` 
                : `<button class="btn btn-sm btn-approve" data-uid="${u.id}" style="background:transparent; border:1px solid #16a34a; color:#16a34a; padding:5px 10px; border-radius:4px; cursor:pointer;">Reativar</button>`
              }
            `}
          </td>
        </tr>
      `;
    }).join('');

    root.innerHTML = `
      <div style="max-width: 1100px; margin: 0 auto; padding: 20px; font-family: sans-serif;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 15px; margin-bottom: 20px;">
          <h2>Gestão de Acessos e Oficiais</h2>
          <button class="btn btn-outline-secondary" onclick="window.history.back()">← Voltar</button>
        </div>
        
        <div style="background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: visible;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead style="background: #f8fafc; border-bottom: 2px solid #cbd5e1;">
              <tr>
                <th style="padding: 12px; text-align: left;">Usuário (Login)</th>
                <th style="padding: 12px; text-align: center;">Status</th>
                <th style="padding: 12px; text-align: left; width: 200px;">Nível de Acesso (Software)</th>
                <th style="padding: 12px; text-align: left; width: 260px;">Oficial Vinculado (Súmula)</th>
                <th style="padding: 12px; text-align: right;">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="5" style="text-align:center; padding: 20px;">Nenhum usuário cadastrado.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;

    bindEvents();
  }

  // 🔥 LÓGICA MESTRA DE SALVAMENTO E VINCULAÇÃO
  async function processUserAction(uid, actionType) {
      const userDoc = usersList.find(u => u.id === uid);
      if (!userDoc) return;

      const accVal = root.querySelector(`select.global-role-sel[data-uid="${uid}"]`).value;
      const refLinkVal = root.querySelector(`select.ref-link-sel[data-uid="${uid}"]`).value;
      
      let finalRefereeId = userDoc.referee_id || null;

      try {
          // 1. O admin escolheu "Criar Novo Oficial"
          if (refLinkVal === 'CREATE_NEW') {
              const newRef = {
                  nome_completo: userDoc.nome_completo,
                  nome_abreviado: userDoc.nome_abreviado || '',
                  uf: userDoc.uf || '',
                  nivel: 'Aspirante Regional', // Padrão
                  uid: uid, // Liga o oficial ao login
                  email: userDoc.email || ''
              };
              const docRef = await addDoc(collection(db, "referees"), newRef);
              finalRefereeId = docRef.id;
          } 
          // 2. O admin vinculou a um oficial que já estava cadastrado antes
          else if (refLinkVal !== 'NONE' && refLinkVal !== '') {
              finalRefereeId = refLinkVal;
              await updateDoc(doc(db, "referees", finalRefereeId), { uid: uid, email: userDoc.email });
          } 
          // 3. O admin removeu o vínculo (Nenhum)
          else if (refLinkVal === 'NONE') {
              // Se ele tinha um vinculado antes, remove a tag uid do oficial
              if (finalRefereeId) {
                  await updateDoc(doc(db, "referees", finalRefereeId), { uid: null });
              }
              finalRefereeId = null;
          }

          // Atualiza o próprio Usuário
          const updates = { 
              global_role: accVal,
              referee_id: finalRefereeId
          };

          if (actionType === 'APPROVE') updates.status = 'approved';
          if (actionType === 'REJECT') updates.status = 'rejected';

          await updateDoc(doc(db, "users", uid), updates);

          if (actionType === 'APPROVE') window.__toast?.("Usuário aprovado e configurado!", "success");
          else if (actionType === 'SAVE') window.__toast?.("Permissões e Vínculo atualizados!", "success");
          else window.__toast?.("Acesso bloqueado.", "error");

          loadData(); // Recarrega tudo
      } catch (err) {
          console.error(err);
          window.__toast?.("Erro ao salvar: " + err.message, "error");
      }
  }

  function bindEvents() {
    root.querySelectorAll('.btn-approve').forEach(btn => {
      btn.onclick = () => processUserAction(btn.dataset.uid, 'APPROVE');
    });

    root.querySelectorAll('.btn-deny').forEach(btn => {
      btn.onclick = async () => {
        if(confirm('Tem certeza que deseja bloquear/suspender este usuário do sistema?')) {
            processUserAction(btn.dataset.uid, 'REJECT');
        }
      };
    });

    root.querySelectorAll('.btn-save-role').forEach(btn => {
      btn.onclick = () => processUserAction(btn.dataset.uid, 'SAVE');
    });
  }

  loadData();
}