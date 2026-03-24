// client/js/pages/oficiais.js

import { db } from '../firebase-config.js';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { canEditGlobal } from '../permissions.js';

function escapeHTML(s = '') {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

const NIVEL = ['Cursista', 'Aspirante Regional', 'Regional', 'Nacional I', 'Nacional II', 'Internacional'];
const UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO','EXT'];

const CRITERIOS_PRATICA = [
  {
    grupo: "1. ASPECTOS COMPORTAMENTAIS (2,0 pontos)",
    itens: [
      { id: "c1_1", texto: "Demonstra proatividade durante a atuação", peso: 0.5 },
      { id: "c1_2", texto: "Demonstra interesse e disposição para aprender", peso: 0.5 },
      { id: "c1_3", texto: "Atua de forma colaborativa (trabalho em equipe)", peso: 0.5 },
      { id: "c1_4", texto: "Segue orientações do Árbitro responsável (sombra)", peso: 0.5 }
    ]
  },
  {
    grupo: "2. DESEMPENHO NOS DIFERENTES PAPÉIS (2,0 pontos)",
    itens: [
      { id: "c2_1", texto: "Aplica corretamente as regras como Árbitro Principal", peso: 0.5 },
      { id: "c2_2", texto: "Aplica corretamente as regras como Árbitro de Linha", peso: 0.5 },
      { id: "c2_3", texto: "Atua adequadamente como Árbitro de Mesa", peso: 0.5 },
      { id: "c2_4", texto: "Contribui com os procedimentos na Câmara de Chamada", peso: 0.5 }
    ]
  },
  {
    grupo: "🔹 3.1 Câmara de Chamada (1,0 ponto)",
    itens: [
      { id: "c31_1", texto: "Apresenta-se aos atletas", peso: 0.1 },
      { id: "c31_2", texto: "Confere número de atletas e funções", peso: 0.1 },
      { id: "c31_3", texto: "Realiza o sorteio da moeda corretamente", peso: 0.2 },
      { id: "c31_4", texto: "Confere quantidade de bolas por atleta", peso: 0.1 },
      { id: "c31_5", texto: "Oferece a possibilidade de verificação das bolas do adversário", peso: 0.1 },
      { id: "c31_6", texto: "Verifica os adesivos dos equipamentos dos atletas", peso: 0.2 },
      { id: "c31_7", texto: "Confere forma de comunicação do atleta", peso: 0.2 }
    ]
  },
  {
    grupo: "🔹 3.2 Checagem de Bolas (2,0 pontos)",
    itens: [
      { id: "c32_1", texto: "Realiza os testes com segurança", peso: 1.0 },
      { id: "c32_2", texto: "Executa os procedimentos conforme o manual oficial", peso: 1.0 }
    ]
  },
  {
    grupo: "🔹 3.3 Procedimentos em Quadra (1,0 ponto)",
    itens: [
      { id: "c33_1", texto: "Posiciona-se corretamente para início do aquecimento (linha V)", peso: 0.1 },
      { id: "c33_2", texto: "Sinaliza início e término do aquecimento (gesto + anúncio)", peso: 0.1 },
      { id: "c33_3", texto: "Posiciona-se corretamente para início da partida (no quadrado)", peso: 0.1 },
      { id: "c33_4", texto: "Entrega a bola-alvo, posiciona-se fora da quadra, gesticula e anuncia", peso: 0.1 },
      { id: "c33_5", texto: "Indica pontuação ao final do parcial utilizando a raquete e voz", peso: 0.1 },
      { id: "c33_6", texto: "Sinaliza corretamente o fim do parcial, executando o gesto", peso: 0.1 },
      { id: "c33_7", texto: "Comunica resultado ao Árbitro de Mesa e ao público", peso: 0.1 },
      { id: "c33_8", texto: "Reproduz corretamente os anúncios de tempo durante o parcial", peso: 0.1 },
      { id: "c33_9", texto: "Reproduz anúncio de 15” entre os parciais", peso: 0.1 },
      { id: "c33_10", texto: "Realiza checagem de bolas pós-jogo corretamente", peso: 0.1 }
    ]
  },
  {
    grupo: "4. ATUAÇÃO EM QUADRA (2,0 pontos)",
    itens: [
      { id: "c4_1", texto: "Utiliza a raquete de forma clara e segura", peso: 0.5 },
      { id: "c4_2", texto: "Demonstra compreensão da lógica do jogo (ordem de jogadas)", peso: 0.5 },
      { id: "c4_3", texto: "Mantém posicionamento adequado em quadra", peso: 0.5 },
      { id: "c4_4", texto: "Realiza medições com segurança e precisão", peso: 0.5 }
    ]
  }
];

// 🔥 MOTOR MATEMÁTICO PROPORCIONAL 🔥
function calcularTotalProporcional(notasObj) {
    let totalGeral = 0;
    CRITERIOS_PRATICA.forEach(grupo => {
        let maxGrupo = 0;
        let pesoObservado = 0;
        let pontosObtidosRaw = 0;
        grupo.itens.forEach(item => {
            maxGrupo += item.peso;
            const val = notasObj["crit_" + item.id];
            if (val !== "NO" && val !== undefined && val !== "") {
                pesoObservado += item.peso;
                let multiplicador = parseFloat(val);
                if (!isNaN(multiplicador)) {
                    pontosObtidosRaw += (multiplicador * item.peso);
                }
            }
        });
        if (pesoObservado > 0) {
            const fatorCorrecao = maxGrupo / pesoObservado;
            totalGeral += (pontosObtidosRaw * fatorCorrecao);
        } else if (pesoObservado === 0 && maxGrupo > 0) {
            totalGeral += maxGrupo;
        }
    });
    return totalGeral;
}

// Retrocompatibilidade: Transforma as notas das avaliações que você já tinha feito no teste
function normalizarNotaAntiga(val, pesoOriginal) {
    if (val === "1" || val === "0.5" || val === "0" || val === "NO") return val;
    if (val == pesoOriginal) return "1";
    if (val == pesoOriginal / 2) return "0.5";
    if (val !== undefined && val !== null && val !== "") return "0";
    return "";
}

export async function renderOficiais(root) {
  const canEdit = canEditGlobal('oficiais');

  root.innerHTML = `
    <style>
      .radio-cell:hover { background-color: #f1f5f9; cursor: pointer; }
      .radio-cell input { cursor: pointer; transform: scale(1.2); }
      .print-only { display: none; }
      
      .btn-view-eval { background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:6px 12px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer; transition:0.2s; }
      .btn-view-eval:hover { background:#2563eb; color:white; }

      @media print {
          @page { margin: 1cm; size: A4 portrait; }
          body > *:not(#oficiais-root) { display: none !important; }
          header, .tabs-container, #form-container, #panel-lista, .no-print, #cursistas-global-header { display: none !important; }
          dialog:not([open]) { display: none !important; }
          dialog[open] { position: absolute; top: 0; left: 0; margin: 0; padding: 0; border: none; box-shadow: none; background: transparent; width: 100%; height: auto; }
          .print-only { display: block !important; width: 100%; }
          .print-table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top:15px; }
          .print-table th, .print-table td { border: 1px solid #000; padding: 6px; text-align: center; }
          .print-table th { background-color: #e2e8f0 !important; -webkit-print-color-adjust: exact; }
          .print-table .text-left { text-align: left; }
          .print-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
          .print-table tr { page-break-inside: avoid; }
      }
    </style>
    <section class="page" id="oficiais-root" style="padding: 20px; max-width: 1300px; margin: 0 auto; font-family: sans-serif;">
      <header class="no-print" style="margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
        <h1 style="margin: 0; color: #0f172a;">Banco de Árbitros e Oficiais</h1>
        <p style="margin: 5px 0 0; color: #64748b; font-size: 14px;">Gerencie os oficiais e acompanhe a avaliação detalhada dos cursistas.</p>
      </header>

      <div class="tabs-container no-print" style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid #cbd5e1; padding-bottom: 10px; overflow-x: auto;">
          <button id="tab-arbitros" class="tab-btn active" style="padding: 10px 20px; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; background: #2563eb; color: white; transition: 0.2s; white-space: nowrap;">Árbitros Oficiais</button>
          <button id="tab-cursistas" class="tab-btn" style="padding: 10px 20px; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; background: #e2e8f0; color: #475569; transition: 0.2s; white-space: nowrap;">🎓 Cursistas e Avaliações</button>
      </div>
      
      <div id="form-container" class="section no-print" style="display: ${canEdit ? 'block' : 'none'};">
        <form id="addOficialForm" style="display:grid; gap:10px; background:#f8fafc; padding:20px; border-radius:8px; border:1px solid #cbd5e1; margin-bottom:25px;">
          <h3 style="margin-top:0; margin-bottom:10px; font-size:16px; color:#1e293b;">Adicionar Novo Oficial/Cursista</h3>
          
          <div style="display:grid; grid-template-columns:2fr 1fr 1.5fr; gap:15px;">
            <label style="display:flex; flex-direction:column; font-weight:bold; font-size:12px; color:#475569;">Nome Completo *
              <input type="text" id="addNome" required style="padding:10px; border:1px solid #cbd5e1; border-radius:6px; margin-top:5px;">
            </label>
            <label style="display:flex; flex-direction:column; font-weight:bold; font-size:12px; color:#475569;">
              <span>Nome Súmula / Abrev. <small style="font-weight:normal; color:#ef4444;">(só 1º nome ou apelido)</small></span>
              <input type="text" id="addAbrev" style="padding:10px; border:1px solid #cbd5e1; border-radius:6px; margin-top:5px;">
            </label>
            <label style="display:flex; flex-direction:column; font-weight:bold; font-size:12px; color:#475569;">E-mail
              <input type="email" id="addEmail" style="padding:10px; border:1px solid #cbd5e1; border-radius:6px; margin-top:5px;">
            </label>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:15px; align-items:end;">
            <label style="display:flex; flex-direction:column; font-weight:bold; font-size:12px; color:#475569;">Nível
              <select id="addNivel" style="padding:10px; border:1px solid #cbd5e1; border-radius:6px; margin-top:5px;">
                ${NIVEL.map(n => `<option value="${n}">${n}</option>`).join("")}
              </select>
            </label>
            <label style="display:flex; flex-direction:column; font-weight:bold; font-size:12px; color:#475569;">UF
              <select id="addUF" style="padding:10px; border:1px solid #cbd5e1; border-radius:6px; margin-top:5px;">
                ${UF.map(u => `<option value="${u}">${u}</option>`).join("")}
              </select>
            </label>
            <button type="submit" class="btn" style="background:#16a34a; color:white; padding:10px; border:none; border-radius:6px; cursor:pointer; font-weight:bold; transition:0.2s;">➕ Adicionar Cadastro</button>
          </div>
        </form>
      </div>

      <div id="cursistas-global-header" style="display:none; justify-content:space-between; align-items:center; background:#eff6ff; padding:15px; border-radius:8px; border:1px solid #bfdbfe; margin-bottom:15px;" class="no-print">
          <div>
              <h3 style="margin:0; color:#1e3a8a; font-size:18px;">Avaliação Externa dos Cursistas</h3>
              <p style="margin:5px 0 0 0; font-size:13px; color:#3b82f6;">Envie este link único para os Árbitros Sombras. Lá eles poderão escolher o cursista e lançar a nota pelo telemóvel.</p>
          </div>
          <div style="display:flex; gap:10px;">
              ${canEdit ? `<button id="btn-toggle-link" style="background:#f59e0b; color:white; border:none; padding:12px 20px; border-radius:8px; font-weight:900; font-size:14px; cursor:pointer; transition:0.2s;">⏳ A carregar...</button>` : ''}
              <button id="btn-copy-global-link" style="background:#2563eb; color:white; border:none; padding:12px 20px; border-radius:8px; font-weight:900; font-size:14px; cursor:pointer; box-shadow:0 4px 6px rgba(37,99,235,0.3); transition:0.2s;">
                  🔗 Copiar Link para o Sombra
              </button>
          </div>
      </div>

      <div id="panel-lista" style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; overflow: auto; display: block;" class="no-print">
        <table class="data-table" style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; min-width: 900px;">
          <thead id="lista-thead" style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;"></thead>
          <tbody id="lista-tbody"></tbody>
        </table>
      </div>

      <dialog id="dlg-prova-teorica" style="border:none; border-radius:12px; padding:25px; max-width:550px; width:90%; box-shadow: 0 10px 25px rgba(0,0,0,0.3);" class="no-print">
        <h3 style="margin-top:0; color:#0f172a; border-bottom:2px solid #e2e8f0; padding-bottom:10px;">📝 Lançamento de Nota Teórica</h3>
        <p><strong>Cursista:</strong> <span id="teorica-nome-oficial" style="color:#2563eb;"></span></p>
        <input type="hidden" id="teorica-id">
        
        <div style="background:#f8fafc; padding:20px; border-radius:8px; border:1px solid #cbd5e1; text-align:center;">
            <label style="display:block; font-size:14px; font-weight:bold; color:#475569; margin-bottom:10px;">Nota Final da Prova Teórica (0.0 a 10.0):</label>
            <input type="number" id="teorica-nota-final" min="0" max="10" step="0.1" placeholder="Ex: 8.5" style="width:150px; padding:15px; border:2px solid #3b82f6; border-radius:8px; font-size:24px; font-weight:bold; text-align:center; color:#1e3a8a;">
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
          <button type="button" onclick="this.closest('dialog').close()" style="background:transparent; border:1px solid #94a3b8; color:#475569; padding:8px 15px; border-radius:6px; font-weight:bold; cursor:pointer;">Cancelar</button>
          <button type="button" id="btn-save-teorica" style="background:#2563eb; color:white; border:none; padding:8px 20px; border-radius:6px; font-weight:bold; cursor:pointer;">💾 Salvar Nota</button>
        </div>
      </dialog>

      <dialog id="dlg-prova-pratica" style="border:none; border-radius:12px; padding:0; max-width:850px; width:95%; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
        <div class="no-print" style="padding:25px; display:flex; flex-direction:column; max-height: 90vh;">
            
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #bbf7d0; padding-bottom:10px; margin-bottom:20px; flex-shrink: 0;">
                <h3 style="margin:0; color:#16a34a; font-size:22px;">📋 Avaliações Práticas</h3>
                <button onclick="this.closest('dialog').close()" style="background:none; border:none; font-size:24px; cursor:pointer; color:#64748b;">&times;</button>
            </div>
            
            <div id="pratica-area-lista" style="flex-shrink: 0;">
                <p><strong>Cursista:</strong> <span id="pratica-nome-oficial" style="color:#15803d; font-size:16px;"></span></p>
                <input type="hidden" id="pratica-id">

                <div id="pratica-historico-lista" style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px; max-height: 350px; overflow-y: auto;"></div>

                <div style="display:flex; gap:10px; margin-bottom:20px;">
                    <button id="btn-print-ficha" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer; flex:1; transition:0.2s;">🖨️ Imprimir Ficha Vazia (Papel)</button>
                    <button id="btn-show-form" style="background:#16a34a; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer; flex:1; transition:0.2s;">➕ Adicionar Nova Manulmente</button>
                </div>
            </div>

            <div id="pratica-form-wrap" style="display:none; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:20px; flex-grow: 1; overflow-y:auto;">
                <h4 id="pratica-form-title" style="margin-top:0; color:#0f172a; position:sticky; top:0; background:#f8fafc; padding-bottom:10px; border-bottom:1px solid #e2e8f0; z-index:10;">Lançamento de Nova Avaliação</h4>
                
                <label style="display:block; margin-bottom:15px; font-weight:bold; font-size:13px; color:#475569;">Nome do Avaliador (Árbitro Sombra / Prof.):
                    <input type="text" id="pratica-avaliador" placeholder="Ex: João Silva" style="width:100%; padding:10px; margin-top:5px; border:1px solid #cbd5e1; border-radius:6px;">
                </label>

                <div id="pratica-tabela-criterios"></div>

                <div style="margin-top:20px; background:#f0fdf4; border:2px solid #22c55e; border-radius:8px; padding:15px; display:flex; justify-content:space-between; align-items:center; position:sticky; bottom:0; z-index:10;">
                    <span style="font-weight:900; font-size:16px; color:#166534;">NOTA DESTA AVALIAÇÃO:</span>
                    <span id="pratica-nota-calc" style="font-size:28px; font-weight:900; color:#15803d;">0.0</span>
                </div>

                <div id="btn-group-add" style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
                    <button id="btn-cancel-form" style="background:transparent; border:1px solid #94a3b8; color:#475569; padding:10px 20px; border-radius:6px; font-weight:bold; cursor:pointer;">Cancelar</button>
                    <button id="btn-save-pratica" style="background:#16a34a; color:white; border:none; padding:10px 25px; border-radius:6px; font-weight:bold; cursor:pointer;">💾 Salvar Avaliação</button>
                </div>
                
                <div id="btn-group-view" style="display:none; justify-content:flex-end; gap:10px; margin-top:20px;">
                    <button id="btn-back-to-list" style="background:transparent; border:1px solid #94a3b8; color:#475569; padding:10px 20px; border-radius:6px; font-weight:bold; cursor:pointer;">← Voltar à Lista</button>
                    <button id="btn-print-specific-eval" style="background:#2563eb; color:white; border:none; padding:10px 25px; border-radius:6px; font-weight:bold; cursor:pointer;">🖨️ Imprimir Esta Prova</button>
                </div>
            </div>
        </div>
      </dialog>

      <dialog id="dlg-hist-comp" class="no-print" style="border:none; border-radius:12px; padding:25px; max-width:550px; width:90%; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
        <h3 style="margin-top:0; color:#0f172a; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">🏆 Histórico de Atuação</h3>
        <div id="hist-comp-list" style="margin: 15px 0; max-height: 400px; overflow-y: auto; padding-right:10px;"></div>
        <div style="text-align:right; border-top:1px solid #e2e8f0; padding-top:15px; margin-top:15px;">
          <button type="button" onclick="this.closest('dialog').close()" style="background:#e2e8f0; color:#475569; border:none; padding:8px 20px; border-radius:6px; font-weight:bold; cursor:pointer;">Fechar Histórico</button>
        </div>
      </dialog>
    </section>
  `;
  
  await attachOficiaisHandlers(root, canEdit);
}

async function attachOficiaisHandlers(root, canEdit) {
  const theadLista = root.querySelector('#lista-thead');
  const tbodyLista = root.querySelector('#lista-tbody');
  
  let currentReferees = [];
  let refHist = {}; 
  let currentTab = 'Arbitros'; 
  let linkAtivo = false;
  let viewingSpecificEvalIndex = -1; // Guarda qual avaliação estamos a ver para imprimir

  const btnArb = root.querySelector('#tab-arbitros');
  const btnCur = root.querySelector('#tab-cursistas');
  const headerCursistas = root.querySelector('#cursistas-global-header');
  const btnToggle = root.querySelector('#btn-toggle-link');

  const updateToggleButton = () => {
      if (!btnToggle) return;
      if (linkAtivo) {
          btnToggle.style.background = '#ef4444';
          btnToggle.innerText = '🚫 Desativar Link Externo';
      } else {
          btnToggle.style.background = '#10b981';
          btnToggle.innerText = '✅ Ativar Link Externo';
      }
  };

  const loadLinkState = async () => {
      if (!canEdit) return;
      try {
          const snap = await getDoc(doc(db, "system_config", "avaliacoes"));
          if (snap.exists() && snap.data().link_ativo !== undefined) {
              linkAtivo = snap.data().link_ativo;
          } else {
              linkAtivo = false;
          }
          updateToggleButton();
      } catch(e) { console.warn("Erro ao buscar config do link:", e); }
  };

  if (canEdit && btnToggle) {
      btnToggle.addEventListener('click', async () => {
          btnToggle.innerText = 'Aguarde...';
          btnToggle.disabled = true;
          try {
              linkAtivo = !linkAtivo;
              await setDoc(doc(db, "system_config", "avaliacoes"), { link_ativo: linkAtivo }, { merge: true });
              updateToggleButton();
              window.__toast?.(`Link de avaliações ${linkAtivo ? 'ATIVADO' : 'DESATIVADO'} com sucesso.`, 'success');
          } catch(e) {
              alert('Erro ao alterar status do link: ' + e.message);
              linkAtivo = !linkAtivo;
              updateToggleButton();
          } finally {
              btnToggle.disabled = false;
          }
      });
  }

  const switchTab = (tabName) => {
      btnArb.style.background = '#e2e8f0'; btnArb.style.color = '#475569';
      btnCur.style.background = '#e2e8f0'; btnCur.style.color = '#475569';

      if (tabName === 'Arbitros') {
          btnArb.style.background = '#2563eb'; btnArb.style.color = 'white';
          headerCursistas.style.display = 'none';
          currentTab = 'Arbitros';
          renderTable();
      } else if (tabName === 'Cursistas') {
          btnCur.style.background = '#2563eb'; btnCur.style.color = 'white';
          headerCursistas.style.display = 'flex';
          currentTab = 'Cursistas';
          renderTable();
          if(canEdit) loadLinkState();
      }
  };

  btnArb.addEventListener('click', () => switchTab('Arbitros'));
  btnCur.addEventListener('click', () => switchTab('Cursistas'));

  root.querySelector('#btn-copy-global-link').addEventListener('click', async () => {
      const urlBase = window.location.origin + window.location.pathname;
      const urlCompleta = `${urlBase}#/avaliacao-externa`;
      try {
          await navigator.clipboard.writeText(urlCompleta);
          alert(`✅ Link Global copiado com sucesso!\n\nLink gerado:\n${urlCompleta}`);
      } catch (err) {
          prompt("Copie o link abaixo:", urlCompleta);
      }
  });

  const renderTable = () => {
      tbodyLista.innerHTML = '';
      if (currentTab === 'Arbitros') {
          theadLista.innerHTML = `
              <tr>
                  <th style="padding: 12px 15px; color:#334155;">Nome Completo</th>
                  <th style="padding: 12px 15px; color:#334155;">Abreviado</th>
                  <th style="padding: 12px 15px; color:#334155;">E-mail</th>
                  <th style="padding: 12px 15px; color:#334155;">Nível</th>
                  <th style="padding: 12px 15px; color:#334155;">UF</th>
                  <th style="padding: 12px 15px; text-align:center; color:#334155;">Competições</th>
                  ${canEdit ? '<th style="padding: 12px 15px; text-align:right; color:#334155;">Ações</th>' : ''}
              </tr>
          `;
          let listaFiltrada = currentReferees.filter(r => r.nivel !== 'Cursista');
          if (listaFiltrada.length === 0) return tbodyLista.innerHTML = `<tr><td colspan="${canEdit ? 7 : 6}" style="padding:20px; text-align:center; color:#64748b;">Nenhum Árbitro encontrado.</td></tr>`;
          listaFiltrada.forEach(item => tbodyLista.appendChild(createArbitroRow(item)));
      } else {
          theadLista.innerHTML = `
              <tr>
                  <th style="padding: 12px 15px; color:#334155; width:25%;">Nome do Cursista</th>
                  <th style="padding: 12px 15px; color:#334155; text-align:center; width:25%;">Prova Teórica</th>
                  <th style="padding: 12px 15px; color:#334155; text-align:center; width:25%;">Prova Prática (Média)</th>
                  <th style="padding: 12px 15px; color:#334155; text-align:center; width:15%;">Resultado Final</th>
                  ${canEdit ? '<th style="padding: 12px 15px; text-align:right; color:#334155; width:10%;">Cadastro</th>' : ''}
              </tr>
          `;
          let listaFiltrada = currentReferees.filter(r => r.nivel === 'Cursista');
          if (listaFiltrada.length === 0) return tbodyLista.innerHTML = `<tr><td colspan="${canEdit ? 5 : 4}" style="padding:40px; text-align:center; color:#64748b; font-size:16px;">Nenhum Cursista em avaliação no momento.</td></tr>`;
          listaFiltrada.forEach(item => tbodyLista.appendChild(createCursistaRow(item)));
      }
  };

  const createArbitroRow = (item) => {
    const tr = document.createElement('tr');
    tr.dataset.id = item.id;
    tr.style.borderBottom = '1px solid #f1f5f9';
    const hist = refHist[item.id] || [];
    let histHtml = hist.length > 0 ? `<button data-act="view-hist" data-id="${item.id}" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:4px 12px; border-radius:12px; font-weight:bold; font-size:12px; cursor:pointer;">${hist.length} Eventos</button>` : `<span style="color:#94a3b8; font-size:12px; font-weight:bold;">Nenhum</span>`;
    let html = `
        <td style="padding:12px 15px; font-weight:bold; color:#1e293b;">${escapeHTML(item.nome_completo || '')}</td>
        <td style="padding:12px 15px; color:#475569;">${escapeHTML(item.nome_abreviado || '—')}</td>
        <td style="padding:12px 15px; color:#475569;">${escapeHTML(item.email || '—')}</td>
        <td style="padding:12px 15px; font-weight:bold; color:#0f172a;">${escapeHTML(item.nivel || '')}</td>
        <td style="padding:12px 15px; color:#475569;">${escapeHTML(item.uf || '')}</td>
        <td style="padding:12px 15px; text-align:center; vertical-align:middle;">${histHtml}</td>
    `;
    if (canEdit) {
        html += `
        <td style="padding:12px 15px; text-align:right; white-space:nowrap;">
            <button data-act="edit" style="background:transparent; border:1px solid #cbd5e1; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; margin-right:5px;">✏️ Editar</button>
            <button data-act="delete" style="background:transparent; border:1px solid #fca5a5; color:#ef4444; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px;">🗑️</button>
        </td>`;
    }
    tr.innerHTML = html;
    return tr;
  };

  const createCursistaRow = (item) => {
    const tr = document.createElement('tr');
    tr.dataset.id = item.id;
    tr.style.borderBottom = '1px solid #f1f5f9';
    
    const notaTeorica = item.avaliacao_teorica?.total ?? '-';
    let notaPraticaMedia = '-';
    const evals = item.avaliacoes_praticas || [];
    if (evals.length > 0) {
        const sum = evals.reduce((acc, curr) => acc + (parseFloat(curr.total) || 0), 0);
        notaPraticaMedia = (sum / evals.length).toFixed(1);
    }
    let finalScore = '-';
    if (notaTeorica !== '-' && notaPraticaMedia !== '-') {
        finalScore = ((parseFloat(notaTeorica) + parseFloat(notaPraticaMedia)) / 2).toFixed(1);
    }

    const btnTeoricaStyle = item.teorica_baixada ? 'background:#eff6ff; color:#1d4ed8; border-color:#bfdbfe;' : 'background:#fefce8; color:#a16207; border-color:#fde047;';
    const btnPraticaStyle = evals.length > 0 ? 'background:#f0fdf4; color:#166534; border-color:#bbf7d0;' : 'background:#f8fafc; color:#475569; border-color:#cbd5e1;';

    let html = `
        <td style="padding: 15px;">
            <div style="font-weight:bold; color:#0f172a; font-size:15px; margin-bottom:4px;">${escapeHTML(item.nome_completo || '')}</div>
            <div style="font-size:11px; color:#64748b; font-weight:bold; display:inline-block; background:#f1f5f9; padding:2px 6px; border-radius:4px;">UF: ${escapeHTML(item.uf)}</div>
        </td>
        <td style="padding: 15px; text-align:center;">
            <div style="display:flex; flex-direction:column; gap:6px; align-items:center;">
                <button data-act="baixar-teorica" data-id="${item.id}" style="${btnTeoricaStyle} padding:6px 12px; border-radius:6px; font-weight:bold; font-size:11px; cursor:pointer; width:150px; border:1px solid;">1. Baixar Prova Teórica</button>
                ${canEdit ? `<button data-act="lancar-teorica" data-id="${item.id}" style="background:#1e293b; color:white; border:none; padding:6px 12px; border-radius:6px; font-weight:bold; font-size:11px; cursor:pointer; width:150px;">📝 Inserir Nota Teórica</button>` : ''}
                <div style="font-size:12px; margin-top:4px; color:#475569;">Nota: <strong style="color:${notaTeorica !== '-' ? '#dc2626' : '#94a3b8'}; font-size:15px;">${notaTeorica}</strong></div>
            </div>
        </td>
        <td style="padding: 15px; text-align:center;">
            <div style="display:flex; flex-direction:column; gap:6px; align-items:center;">
                ${canEdit ? `<button data-act="gerir-pratica" data-id="${item.id}" style="${btnPraticaStyle} padding:8px 12px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer; width:170px; border:1px solid;">📋 Avaliações Práticas (${evals.length})</button>` : ''}
                <div style="font-size:12px; margin-top:4px; color:#475569;">Média Geral: <strong style="color:${notaPraticaMedia !== '-' ? '#16a34a' : '#94a3b8'}; font-size:15px;">${notaPraticaMedia}</strong></div>
            </div>
        </td>
        <td style="padding: 15px; text-align:center; vertical-align:middle;">
            <div style="background:${finalScore >= 7.0 ? '#10b981' : (finalScore !== '-' ? '#ef4444' : '#f1f5f9')}; color:${finalScore !== '-' ? 'white' : '#94a3b8'}; padding:12px; border-radius:8px; font-size:24px; font-weight:900; display:inline-block; min-width: 60px;">${finalScore}</div>
        </td>
    `;
    if (canEdit) {
        html += `
        <td style="padding: 12px 15px; text-align:right; white-space: nowrap;">
            <button data-act="edit" style="background:transparent; border:1px solid #cbd5e1; padding:6px; border-radius:6px; cursor:pointer; font-size:12px; margin-bottom:5px; display:block; width:100%; text-align:center;">✏️ Editar</button>
            <button data-act="delete" style="background:#fef2f2; border:1px solid #fca5a5; color:#ef4444; padding:6px; border-radius:6px; cursor:pointer; font-size:12px; display:block; width:100%; text-align:center;">🗑️ Excluir</button>
        </td>`;
    }
    tr.innerHTML = html;
    return tr;
  };

  const createEditRow = (item) => {
      // ...mesma lógica de edição...
      const tr = document.createElement('tr');
      tr.dataset.id = item.id;
      tr.style.background = '#fffbeb';
      const nivelOpts = NIVEL.map(n => `<option value="${n}" ${n === item.nivel ? 'selected' : ''}>${n}</option>`).join('');
      const ufOpts = UF.map(u => `<option value="${u}" ${u === item.uf ? 'selected' : ''}>${u}</option>`).join('');
      let html = `
          <td style="padding:12px 15px;"><input type="text" class="edit-nome" value="${escapeHTML(item.nome_completo || '')}" style="width:100%; padding:6px; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;"></td>
          <td style="padding:12px 15px;" colspan="${currentTab === 'Cursistas' ? '2' : '1'}"><input type="text" class="edit-abrev" value="${escapeHTML(item.nome_abreviado || '')}" style="width:100%; padding:6px; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;"></td>
          <td style="padding:12px 15px;"><select class="edit-nivel" style="width:100%; padding:6px; border:1px solid #cbd5e1; border-radius:4px;">${nivelOpts}</select></td>
          <td style="padding:12px 15px;"><select class="edit-uf" style="width:100%; padding:6px; border:1px solid #cbd5e1; border-radius:4px;">${ufOpts}</select></td>
      `;
      if (canEdit) {
          html += `
          <td style="padding:12px 15px; text-align:right; white-space:nowrap;">
              <button data-act="save" style="background:#16a34a; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-weight:bold; margin-bottom:4px; width:100%;">Salvar</button>
              <button data-act="cancel" style="background:#e2e8f0; color:#475569; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; width:100%;">Cancelar</button>
          </td>`;
      }
      tr.innerHTML = html;
      return tr;
  };

  const refresh = async () => {
    try {
      const [snapRefs, snapComps, snapCompOffs] = await Promise.all([
          getDocs(collection(db, "referees")),
          getDocs(collection(db, "competitions")),
          getDocs(collection(db, "competition_officials"))
      ]);
      const compDict = {};
      snapComps.forEach(d => compDict[d.id] = d.data());
      refHist = {};
      snapCompOffs.forEach(d => {
          const data = d.data();
          const refId = data.official_id; 
          if (refId) {
              if (!refHist[refId]) refHist[refId] = [];
              refHist[refId].push({
                  compId: data.competition_id,
                  role: data.role || 'Oficial',
                  compName: compDict[data.competition_id]?.nome || 'Competição Excluída',
                  compDate: compDict[data.competition_id]?.data_inicio || 'N/A'
              });
          }
      });
      currentReferees = snapRefs.docs.map(d => ({ id: d.id, ...d.data() }));
      currentReferees.sort((a, b) => (a.nome_completo || '').localeCompare(b.nome_completo || ''));
      renderTable();
    } catch (e) {
      tbodyLista.innerHTML = `<tr><td colspan="7" style="padding:20px; color:red; text-align:center;">Erro ao carregar dados: ${e.message}</td></tr>`;
    }
  };

  const modalT = root.querySelector('#dlg-prova-teorica');
  const inputNotaT = modalT.querySelector('#teorica-nota-final');

  const openModalTeorica = (id) => {
      const oficial = currentReferees.find(r => r.id === id);
      if(!oficial) return;
      modalT.querySelector('#teorica-id').value = id;
      modalT.querySelector('#teorica-nome-oficial').innerText = oficial.nome_completo;
      inputNotaT.value = oficial.avaliacao_teorica?.total || '';
      modalT.showModal();
  };

  modalT.querySelector('#btn-save-teorica').onclick = async () => {
      const id = modalT.querySelector('#teorica-id').value;
      const btn = modalT.querySelector('#btn-save-teorica');
      let val = parseFloat(inputNotaT.value);
      if (isNaN(val) || val < 0 || val > 10) return alert("Insira uma nota válida de 0 a 10.");
      btn.disabled = true; btn.innerText = "Salvando...";
      try {
          await updateDoc(doc(db, "referees", id), { avaliacao_teorica: { total: val } });
          window.__toast?.('Nota Teórica salva!', 'success');
          modalT.close();
          await refresh(); 
      } catch(e) { alert("Erro: " + e.message); }
      finally { btn.disabled = false; btn.innerText = "💾 Salvar Nota"; }
  };

  // 🔥 LÓGICA DO MODAL PRÁTICO 🔥
  const modalP = root.querySelector('#dlg-prova-pratica');
  const areaListaP = modalP.querySelector('#pratica-area-lista');
  const histListaP = modalP.querySelector('#pratica-historico-lista');
  
  const formWrapP = modalP.querySelector('#pratica-form-wrap');
  const formTitleP = modalP.querySelector('#pratica-form-title');
  const tabelaCriteriosP = modalP.querySelector('#pratica-tabela-criterios');
  const notaCalcP = modalP.querySelector('#pratica-nota-calc');
  const inputAvaliador = modalP.querySelector('#pratica-avaliador');
  
  const btnGroupAdd = modalP.querySelector('#btn-group-add');
  const btnGroupView = modalP.querySelector('#btn-group-view');

  const buildCriteriosHtml = () => {
      let html = ``;
      CRITERIOS_PRATICA.forEach(grupo => {
          html += `<div style="background:#e2e8f0; font-weight:bold; color:#0f172a; padding:8px 10px; border-radius:6px 6px 0 0; margin-top:15px; font-size:13px;">${grupo.grupo}</div>`;
          html += `<div style="background:white; border:1px solid #cbd5e1; border-top:none; border-radius:0 0 6px 6px; padding:10px;">`;
          grupo.itens.forEach((item, idx) => {
              const borderBottom = idx < grupo.itens.length - 1 ? 'border-bottom:1px solid #f1f5f9;' : '';
              html += `
                  <div style="padding:12px 0; ${borderBottom}">
                      <div style="font-size:13px; color:#334155; margin-bottom:8px; line-height:1.3;">
                          ${item.texto} <strong style="color:#2563eb;">(${item.peso.toFixed(1)})</strong>
                      </div>
                      <div style="display:flex; gap:5px;">
                          <label style="flex:1; background:#f0fdf4; border:1px solid #bbf7d0; padding:8px 2px; border-radius:4px; text-align:center; cursor:pointer;" class="radio-cell">
                              <input type="radio" name="crit_${item.id}" value="1" class="pratica-radio">
                              <div style="font-size:10px; font-weight:bold; color:#166534; margin-top:4px;">Realizou</div>
                          </label>
                          <label style="flex:1; background:#fffbeb; border:1px solid #fde68a; padding:8px 2px; border-radius:4px; text-align:center; cursor:pointer;" class="radio-cell">
                              <input type="radio" name="crit_${item.id}" value="0.5" class="pratica-radio">
                              <div style="font-size:10px; font-weight:bold; color:#b45309;">Parcial</div>
                          </label>
                          <label style="flex:1; background:#fef2f2; border:1px solid #fecaca; padding:8px 2px; border-radius:4px; text-align:center; cursor:pointer;" class="radio-cell">
                              <input type="radio" name="crit_${item.id}" value="0" class="pratica-radio">
                              <div style="font-size:10px; font-weight:bold; color:#b91c1c;">Não Fez</div>
                          </label>
                          <label style="flex:1; background:#f8fafc; border:1px dashed #cbd5e1; padding:8px 2px; border-radius:4px; text-align:center; cursor:pointer;" class="radio-cell">
                              <input type="radio" name="crit_${item.id}" value="NO" class="pratica-radio">
                              <div style="font-size:10px; font-weight:bold; color:#475569;">N/O</div>
                          </label>
                      </div>
                  </div>
              `;
          });
          html += `</div>`;
      });
      return html;
  };

  const buildPrintHtml = (evalData) => {
      let html = `<thead><tr>
                  <th style="text-align:left;">Item Avaliado</th>
                  <th style="width:60px;">Realizou</th>
                  <th style="width:60px;">Parcial</th>
                  <th style="width:60px;">Não Fez</th>
                  <th style="width:60px;">N/O</th>
               </tr></thead><tbody>`;

      CRITERIOS_PRATICA.forEach(grupo => {
          html += `<tr><td colspan="5" style="background:#e2e8f0; font-weight:bold; padding:8px; font-size:11pt; text-align:left;">${grupo.grupo}</td></tr>`;
          grupo.itens.forEach(item => {
              let mr = "", mp = "", mn = "", mo = "";
              
              if (evalData) {
                  let valRaw = evalData.notas["crit_" + item.id];
                  let val = normalizarNotaAntiga(valRaw, item.peso);
                  if (val === "1") mr = "X";
                  else if (val === "0.5") mp = "X";
                  else if (val === "0") mn = "X";
                  else if (val === "NO") mo = "X";
              }

              html += `
                  <tr>
                      <td class="text-left" style="padding:6px; font-size:9.5pt;">${item.texto} (${item.peso.toFixed(1)})</td>
                      <td>( &nbsp;${mr}&nbsp; )</td>
                      <td>( &nbsp;${mp}&nbsp; )</td>
                      <td>( &nbsp;${mn}&nbsp; )</td>
                      <td>( &nbsp;${mo}&nbsp; )</td>
                  </tr>
              `;
          });
      });
      html += `</tbody>`;
      return html;
  };

  const openModalPratica = (id) => {
      const oficial = currentReferees.find(r => r.id === id);
      if(!oficial) return;
      
      modalP.querySelector('#pratica-id').value = id;
      modalP.querySelector('#pratica-nome-oficial').innerText = oficial.nome_completo;
      
      areaListaP.style.display = 'block';
      formWrapP.style.display = 'none';

      const evals = oficial.avaliacoes_praticas || [];
      if (evals.length === 0) {
          histListaP.innerHTML = `<div style="padding:15px; background:#f8fafc; color:#64748b; text-align:center; border-radius:6px; font-style:italic;">Nenhuma avaliação prática registada no sistema.</div>`;
      } else {
          histListaP.innerHTML = evals.map((ev, idx) => {
              const metaHtml = ev.metadata ? `
                  <div style="font-size:10px; color:#64748b; margin-top:4px; padding-top:4px; border-top:1px solid #dcfce7;">
                      🖥️ ${escapeHTML(ev.metadata.device)} | 🌐 IP: ${escapeHTML(ev.metadata.ip)}
                  </div>
              ` : '';
              return `
              <div style="display:flex; justify-content:space-between; align-items:center; background:#f0fdf4; border:1px solid #bbf7d0; padding:12px 15px; border-radius:6px;">
                 <div>
                    <div style="font-weight:bold; color:#166534; font-size:14px;">Avaliação #${idx+1}</div>
                    <div style="font-size:12px; color:#15803d; margin-top:2px;">Avaliador: <strong>${escapeHTML(ev.avaliador)}</strong></div>
                    <div style="font-size:10px; color:#16a34a; margin-top:2px;">${new Date(ev.data).toLocaleString('pt-BR')}</div>
                    ${metaHtml}
                 </div>
                 <div style="display:flex; align-items:center; gap:15px;">
                    <div style="font-size:24px; font-weight:900; color:#16a34a; background:white; padding:5px 15px; border-radius:8px; border:2px solid #bbf7d0;">
                        ${parseFloat(ev.total).toFixed(1)}
                    </div>
                    <div style="display:flex; flex-direction:column; gap:5px;">
                        <button class="btn-view-eval" data-idx="${idx}">👁️ Ver / Imprimir</button>
                        <button class="btn-del-avaliacao-pratica" data-idx="${idx}" style="background:transparent; border:none; color:#ef4444; cursor:pointer; font-size:16px;" title="Excluir Avaliação">🗑️</button>
                    </div>
                 </div>
              </div>
              `;
          }).join('');

          modalP.querySelectorAll('.btn-del-avaliacao-pratica').forEach(btn => {
              btn.addEventListener('click', async (e) => {
                  if(!confirm('Deseja realmente apagar esta avaliação?')) return;
                  const index = parseInt(e.target.dataset.idx);
                  evals.splice(index, 1);
                  try {
                      await updateDoc(doc(db, "referees", id), { avaliacoes_praticas: evals });
                      window.__toast?.('Avaliação apagada.', 'info');
                      await refresh();
                      openModalPratica(id); 
                  } catch(err) { alert("Erro ao apagar: " + err.message); }
              });
          });

          // 🔥 EVENTO DE VER/IMPRIMIR PROVA ESPECÍFICA 🔥
          modalP.querySelectorAll('.btn-view-eval').forEach(btn => {
              btn.addEventListener('click', (e) => {
                  const idx = parseInt(e.target.dataset.idx);
                  viewingSpecificEvalIndex = idx;
                  const ev = evals[idx];
                  
                  areaListaP.style.display = 'none';
                  formWrapP.style.display = 'block';
                  
                  formTitleP.innerText = `Visualizando Avaliação #${idx+1}`;
                  inputAvaliador.value = ev.avaliador;
                  inputAvaliador.disabled = true;
                  
                  tabelaCriteriosP.innerHTML = buildCriteriosHtml();
                  
                  // Preenche os radios
                  CRITERIOS_PRATICA.forEach(g => {
                      g.itens.forEach(item => {
                          const valRaw = ev.notas["crit_" + item.id];
                          const val = normalizarNotaAntiga(valRaw, item.peso);
                          
                          if (val) {
                              const radio = modalP.querySelector(`input[name="crit_${item.id}"][value="${val}"]`);
                              if (radio) radio.checked = true;
                          }
                      });
                  });
                  
                  // Bloqueia todos os radios
                  modalP.querySelectorAll('.pratica-radio').forEach(r => r.disabled = true);
                  
                  notaCalcP.innerText = parseFloat(ev.total).toFixed(1);
                  
                  btnGroupAdd.style.display = 'none';
                  btnGroupView.style.display = 'flex';
                  modalP.querySelector('.no-print').scrollTop = 0;
              });
          });
      }

      modalP.showModal();
  };

  modalP.querySelector('#btn-show-form').onclick = () => {
      areaListaP.style.display = 'none';
      formWrapP.style.display = 'block';
      
      formTitleP.innerText = "Lançamento de Nova Avaliação";
      inputAvaliador.value = '';
      inputAvaliador.disabled = false;
      
      tabelaCriteriosP.innerHTML = buildCriteriosHtml();
      notaCalcP.innerText = '0.0';
      
      // Recalcula ao clicar nos radios
      modalP.querySelectorAll('.pratica-radio').forEach(rad => {
          rad.addEventListener('change', () => {
              const notasObj = {};
              modalP.querySelectorAll('.pratica-radio:checked').forEach(checked => {
                  notasObj[checked.name] = checked.value;
              });
              notaCalcP.innerText = calcularTotalProporcional(notasObj).toFixed(1);
          });
      });

      btnGroupView.style.display = 'none';
      btnGroupAdd.style.display = 'flex';
  };

  modalP.querySelector('#btn-cancel-form').onclick = () => {
      formWrapP.style.display = 'none';
      areaListaP.style.display = 'block';
  };

  modalP.querySelector('#btn-back-to-list').onclick = () => {
      formWrapP.style.display = 'none';
      areaListaP.style.display = 'block';
  };

  // Imprimir Ficha Vazia (da lista)
  modalP.querySelector('#btn-print-ficha').onclick = () => {
      const nomeCursista = modalP.querySelector('#pratica-nome-oficial').innerText;
      const printWindow = window.open('', '_blank');
      const htmlTabela = buildPrintHtml(null); // Passa null para vir vazio
      printWindow.document.write(`
          <html>
          <head>
              <title>Ficha de Avaliação Prática</title>
              <style>
                  body { font-family: Arial, sans-serif; margin: 20px; color: #000; }
                  h2 { text-align: center; font-size: 16pt; margin-bottom: 5px; text-transform: uppercase; }
                  table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 10pt; }
                  th, td { border: 1px solid #000; padding: 6px; text-align: center; }
                  th { background-color: #e2e8f0; -webkit-print-color-adjust: exact; }
                  .text-left { text-align: left; }
                  tr { page-break-inside: avoid; }
              </style>
          </head>
          <body>
              <h2>AVALIAÇÃO PRÁTICA – ARBITRAGEM DE BOCHA PARALÍMPICA</h2>
              <div style="display:flex; justify-content:space-between; font-size:12pt; margin-top:20px;">
                  <div><strong>Cursista:</strong> ${nomeCursista}<br><br><strong>Data:</strong> ____/____/________</div>
                  <div style="text-align:right;"><strong>Avaliador:</strong> ___________________________________<br><br><strong>Assinatura:</strong> ___________________________________</div>
              </div>
              <table>${htmlTabela}</table>
              <div style="margin-top:30px; text-align:right; font-size:14pt; font-weight:bold;">Nota Final: _______ / 10.0</div>
              <script>window.onload=function(){window.print(); setTimeout(function(){window.close();},500);}</script>
          </body></html>
      `);
      printWindow.document.close();
  };

  // 🔥 IMPRIMIR PROVA ESPECÍFICA PREENCHIDA 🔥
  modalP.querySelector('#btn-print-specific-eval').onclick = () => {
      const id = modalP.querySelector('#pratica-id').value;
      const oficial = currentReferees.find(r => r.id === id);
      const ev = oficial.avaliacoes_praticas[viewingSpecificEvalIndex];
      const nomeCursista = oficial.nome_completo;
      const dataFormatada = new Date(ev.data).toLocaleDateString('pt-BR');
      
      const printWindow = window.open('', '_blank');
      const htmlTabela = buildPrintHtml(ev); 
      
      printWindow.document.write(`
          <html>
          <head>
              <title>Avaliação de ${nomeCursista}</title>
              <style>
                  body { font-family: Arial, sans-serif; margin: 20px; color: #000; }
                  h2 { text-align: center; font-size: 16pt; margin-bottom: 5px; text-transform: uppercase; }
                  table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 10pt; }
                  th, td { border: 1px solid #000; padding: 6px; text-align: center; }
                  th { background-color: #e2e8f0; -webkit-print-color-adjust: exact; }
                  .text-left { text-align: left; }
                  tr { page-break-inside: avoid; }
              </style>
          </head>
          <body>
              <h2>AVALIAÇÃO PRÁTICA – RESULTADO</h2>
              <div style="display:flex; justify-content:space-between; font-size:12pt; margin-top:20px;">
                  <div><strong>Cursista:</strong> ${nomeCursista}<br><br><strong>Data:</strong> ${dataFormatada}</div>
                  <div style="text-align:right;"><strong>Avaliador:</strong> ${escapeHTML(ev.avaliador)}<br><br><strong>Assinatura:</strong> ___________________________________</div>
              </div>
              <table>${htmlTabela}</table>
              <div style="margin-top:30px; text-align:right; font-size:16pt; font-weight:bold; color:#16a34a;">Nota Final: ${parseFloat(ev.total).toFixed(1)} / 10.0</div>
              <script>window.onload=function(){window.print(); setTimeout(function(){window.close();},500);}</script>
          </body></html>
      `);
      printWindow.document.close();
  };

  modalP.querySelector('#btn-save-pratica').onclick = async () => {
      const id = modalP.querySelector('#pratica-id').value;
      const oficial = currentReferees.find(r => r.id === id);
      const avaliador = inputAvaliador.value.trim();
      
      if (!avaliador) return alert("Insira o nome do Avaliador (Árbitro Sombra).");

      const notasObj = {};
      modalP.querySelectorAll('.pratica-radio:checked').forEach(checked => {
          notasObj[checked.name] = checked.value;
      });
      const total = calcularTotalProporcional(notasObj);

      const payload = {
          avaliador: avaliador,
          data: new Date().toISOString(),
          notas: notasObj,
          total: total,
          metadata: { ip: "Sistema Interno", device: "Admin", userAgent: navigator.userAgent }
      };

      const btn = modalP.querySelector('#btn-save-pratica');
      btn.disabled = true; btn.innerText = "Salvando...";

      const historicoNovo = [...(oficial.avaliacoes_praticas || []), payload];

      try {
          await updateDoc(doc(db, "referees", id), { avaliacoes_praticas: historicoNovo });
          window.__toast?.('Nova avaliação salva!', 'success');
          await refresh(); 
          openModalPratica(id); // Volta a carregar o modal na lista
      } catch(e) { alert("Erro ao salvar: " + e.message); }
      finally { btn.disabled = false; btn.innerText = "💾 Salvar Avaliação"; }
  };

  if (canEdit) {
      const addForm = root.querySelector('#addOficialForm');
      addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSubmit = addForm.querySelector('button[type="submit"]');
        const body = {
          nome_completo: root.querySelector('#addNome').value.trim(),
          nome_abreviado: root.querySelector('#addAbrev').value.trim(),
          email: root.querySelector('#addEmail').value.trim(),
          nivel: root.querySelector('#addNivel').value,
          uf: root.querySelector('#addUF').value,
          teorica_baixada: false,
          avaliacoes_praticas: []
        };
        if (!body.nome_completo) return alert('O nome é obrigatório.');
        btnSubmit.disabled = true; btnSubmit.textContent = 'Aguarde...';

        try {
          await addDoc(collection(db, "referees"), body);
          addForm.reset(); 
          if(window.__toast) window.__toast('Cadastro concluído!', 'success');
          if(body.nivel === 'Cursista') switchTab('Cursistas');
          else switchTab('Arbitros');
          await refresh(); 
        } catch (err) { alert(`Erro: ${err.message}`); } 
        finally { btnSubmit.disabled = false; btnSubmit.textContent = '➕ Adicionar Cadastro'; }
      });

      tbodyLista.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const { act, id } = btn.dataset;
        
        if (act === 'lancar-teorica') return openModalTeorica(id);
        if (act === 'gerir-pratica') return openModalPratica(id);

        if (act === 'view-hist') {
            const hist = refHist[id] || [];
            const histList = root.querySelector('#hist-comp-list');
            hist.sort((a,b) => b.compDate.localeCompare(a.compDate));
            histList.innerHTML = hist.map(h => `<div style="padding:15px; border-bottom:1px solid #f1f5f9; background:#f8fafc; border-radius:8px; margin-bottom:8px;"><div style="font-weight:bold; color:#0f172a; font-size:15px;">${escapeHTML(h.compName)}</div><div style="display:flex; justify-content:space-between; margin-top:6px;"><span style="font-size:13px; color:#64748b;">📅 ${escapeHTML(h.compDate)}</span><span style="background:#e0e7ff; color:#1d4ed8; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:bold;">🏷️ ${escapeHTML(h.role)}</span></div></div>`).join('');
            root.querySelector('#dlg-hist-comp').showModal();
            return;
        }

        const row = btn.closest('tr');
        if (!row) return;
        const rowId = row.dataset.id;
        
        if (act === 'edit') {
          const item = currentReferees.find(i => i.id === rowId);
          if(item) row.replaceWith(createEditRow(item));
        }
        if (act === 'cancel') {
          const item = currentReferees.find(i => i.id === rowId);
          if(item) {
              if (item.nivel === 'Cursista') row.replaceWith(createCursistaRow(item));
              else row.replaceWith(createArbitroRow(item));
          }
        }
        if (act === 'delete') {
          if (!confirm(`Atenção: Excluir um cadastro pode causar erros no histórico. Continuar?`)) return;
          btn.disabled = true;
          try {
            await deleteDoc(doc(db, "referees", rowId));
            window.__toast?.('Excluído.', 'success');
            await refresh();
          } catch (err) { alert(`Erro: ${err.message}`); btn.disabled = false; }
        }
        if (act === 'save') {
          const body = {
            nome_completo: row.querySelector('.edit-nome').value.trim(),
            nome_abreviado: row.querySelector('.edit-abrev').value.trim(),
            nivel: row.querySelector('.edit-nivel').value,
            uf: row.querySelector('.edit-uf').value,
          };
          if (!body.nome_completo) return alert('O nome é obrigatório.');
          btn.disabled = true; btn.textContent = '...';

          try {
            await updateDoc(doc(db, "referees", rowId), body);
            window.__toast?.('Salvo com sucesso!', 'success');
            await refresh();
          } catch (err) { alert(`Erro: ${err.message}`); btn.disabled = false; btn.textContent = 'Salvar'; }
        }
      });
  } else {
      tbodyLista.addEventListener('click', (e) => {
          const btn = e.target.closest('button');
          if (btn && btn.dataset.act === 'view-hist') {
              const hist = refHist[btn.dataset.id] || [];
              const histList = root.querySelector('#hist-comp-list');
              hist.sort((a,b) => b.compDate.localeCompare(a.compDate));
              histList.innerHTML = hist.map(h => `<div style="padding:15px; border-bottom:1px solid #f1f5f9; background:#f8fafc; border-radius:8px; margin-bottom:8px;"><div style="font-weight:bold; color:#0f172a; font-size:15px;">${escapeHTML(h.compName)}</div><div style="display:flex; justify-content:space-between; margin-top:6px;"><span style="font-size:13px; color:#64748b;">📅 ${escapeHTML(h.compDate)}</span><span style="background:#e0e7ff; color:#1d4ed8; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:bold;">🏷️ ${escapeHTML(h.role)}</span></div></div>`).join('');
              root.querySelector('#dlg-hist-comp').showModal();
          }
      });
  }
  
  await refresh();
}