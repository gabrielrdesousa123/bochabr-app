// client/js/pages/competition-new.js

import { db } from '../firebase-config.js';
import { collection, getDocs, getDoc, doc, addDoc, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ============================================================================
// FUNÇÕES FIREBASE
// ============================================================================

const API = {
  getClassesDropdown: async () => {
    try {
        const snap = await getDocs(collection(db, "classes"));
        return { items: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
    } catch(e) { throw { error: 'Falha ao carregar classes do Firebase' }; }
  },
  getCompetition: async (id) => {
    try {
        const docRef = doc(db, "competitions", String(id));
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() };
        throw new Error('Competição não encontrada');
    } catch(e) { throw { error: 'Falha ao carregar competição do Firebase' }; }
  },
  getCompetitionClasses: async (id) => {
    try {
        const q = query(collection(db, "competition_classes"), where("competition_id", "==", String(id)));
        const snap = await getDocs(q);
        return { items: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
    } catch(e) { throw { error: 'Falha ao carregar classes da competição' }; }
  },
  createCompetition: async (payload) => {
    try {
        const classesArray = payload.classes || [];
        delete payload.classes; 
        
        payload.created_at = new Date().toISOString(); 
        
        const docRef = await addDoc(collection(db, "competitions"), payload);
        
        for (const clsCode of classesArray) {
            await addDoc(collection(db, "competition_classes"), {
                competition_id: docRef.id,
                class_code: clsCode,
                type: payload.metodo 
            });
        }
        return { id: docRef.id };
    } catch(e) { throw { error: 'Falha ao criar competição no Firebase: ' + e.message }; }
  },
  updateCompetition: async (id, payload) => {
    try {
        const classesArray = payload.classes || [];
        delete payload.classes;
        
        payload.updated_at = new Date().toISOString();
        
        // 1. Atualiza os dados da Competição Principal
        await updateDoc(doc(db, "competitions", String(id)), payload);
        
        // 2. Remove os vínculos de classes antigos
        const q = query(collection(db, "competition_classes"), where("competition_id", "==", String(id)));
        const snap = await getDocs(q);
        const delPromises = snap.docs.map(d => deleteDoc(doc(db, "competition_classes", d.id)));
        await Promise.all(delPromises);

        // 3. Cadastra os novos vínculos de classes selecionados na edição
        for (const clsCode of classesArray) {
            await addDoc(collection(db, "competition_classes"), {
                competition_id: String(id),
                class_code: clsCode,
                type: payload.metodo
            });
        }
        return { id };
    } catch(e) { throw { error: 'Falha ao atualizar competição no Firebase: ' + e.message }; }
  },
};

function getQuery(hash) {
  const idx = hash.indexOf('?');
  const q = idx >= 0 ? hash.slice(idx + 1) : '';
  const p = new URLSearchParams(q);
  const o = {};
  for (const [k, v] of p.entries()) o[k] = v;
  return o;
}

function escapeHTML(s = '') {
  return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

function toInputDate(s) {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = String(s).split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    if (y && m && d) return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return '';
}

function fromInputDate(s) {
  return s || null;
}

function METODO_NORMALIZADO(v) {
  const up = String(v || '').toUpperCase();
  if (up === 'WORLD_BOCCIA') return 'WORLD_BOCCIA';
  if (up === 'ELIMINATORIA') return 'ELIMINATORIA';
  return 'ELIMINATORIA'; 
}

function showFormError(form, msg) {
  let el = form.querySelector('.comp-error');
  if (!el) {
    el = document.createElement('div');
    el.className = 'comp-error';
    el.style.color = '#dc2626';
    el.style.background = '#fee2e2';
    el.style.padding = '12px';
    el.style.borderRadius = '8px';
    el.style.fontWeight = 'bold';
    el.style.marginBottom = '20px';
    form.prepend(el);
  }
  el.textContent = msg;
}

export async function renderCompetitionNew(root, hash) {
  const currentHash = hash || window.location.hash;
  const { id } = getQuery(currentHash);
  
  const state = {
    competitionId: id || null,
    allClasses: [],              
    selectedClassCodes: new Set(),  
    classesUI: null,              
  };
  
  const isEdit = !!state.competitionId;

  root.innerHTML = `
    <section class="comp-new" style="max-width: 900px; margin: 0 auto; padding: 20px; font-family: sans-serif;">
      <header style="display: flex; align-items: center; gap: 15px; margin-bottom: 25px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px;">
        <button type="button" id="btnBack" style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 15px; border-radius: 6px; cursor: pointer; font-weight: bold; color: #475569; transition: 0.2s;">&larr; Voltar</button>
        <h1 id="compNewTitle" style="margin: 0; color: #0f172a; font-size: 24px;">Carregando...</h1>
      </header>

      <form id="compForm" style="background: #fff; padding: 30px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 15px rgba(0,0,0,0.05);" novalidate>
        <h3 style="margin-top: 0; color: #334155; margin-bottom: 20px; font-size: 18px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px;">📋 Dados do Torneio</h3>
        
        <div style="display: flex; flex-direction: column; gap: 15px; margin-bottom: 30px;">
            <div>
              <label style="display: block; font-weight: bold; color: #475569; margin-bottom: 5px; font-size: 13px; text-transform: uppercase;">Nome da Competição <span style="color:red;">*</span></label>
              <input type="text" name="nome" id="fNome" style="width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 15px;" required />
            </div>
            
            <div>
              <label style="display: block; font-weight: bold; color: #475569; margin-bottom: 5px; font-size: 13px; text-transform: uppercase;">Local (Cidade/Ginásio) <span style="color:red;">*</span></label>
              <input type="text" name="local" id="fLocal" style="width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 15px;" required />
            </div>

            <div style="display: flex; gap: 15px;">
              <div style="flex: 1;">
                <label style="display: block; font-weight: bold; color: #475569; margin-bottom: 5px; font-size: 13px; text-transform: uppercase;">Método <span style="color:red;">*</span></label>
                <select name="metodo" id="fMetodo" style="width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 15px;" required>
                  <option value="ELIMINATORIA" selected>Eliminatória Direta (Mata-Mata Puro)</option>
                  <option value="WORLD_BOCCIA">Padrão World Boccia (Fase de Grupos)</option>
                </select>
              </div>
              <div style="flex: 1;">
                <label style="display: block; font-weight: bold; color: #475569; margin-bottom: 5px; font-size: 13px; text-transform: uppercase;">Nível</label>
                <select name="nivel" id="fNivel" style="width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 15px;">
                  <option value="">Selecione o nível</option>
                  <option value="Local">Local</option>
                  <option value="Estadual">Estadual</option>
                  <option value="Regional">Regional</option>
                  <option value="Nacional">Nacional</option>
                  <option value="Internacional">Internacional</option>
                </select>
              </div>
            </div>

            <div style="display: flex; gap: 15px;">
              <div style="flex: 1;">
                <label style="display: block; font-weight: bold; color: #475569; margin-bottom: 5px; font-size: 13px; text-transform: uppercase;">Data Início <span style="color:red;">*</span></label>
                <input type="date" name="data_inicio" id="fDataIni" style="width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 15px;" required />
              </div>
              <div style="flex: 1;">
                <label style="display: block; font-weight: bold; color: #475569; margin-bottom: 5px; font-size: 13px; text-transform: uppercase;">Data Fim <span style="color:red;">*</span></label>
                <input type="date" name="data_fim" id="fDataFim" style="width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 15px;" required />
              </div>
            </div>

            <div style="display: flex; gap: 15px;">
              <div style="flex: 1;">
                <label style="display: block; font-weight: bold; color: #475569; margin-bottom: 5px; font-size: 13px; text-transform: uppercase;">Nº Máx de Quadras</label>
                <input type="number" name="num_quadras" id="fQuadras" min="1" step="1" style="width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 15px;" />
              </div>
              <div style="flex: 1;">
                <label style="display: block; font-weight: bold; color: #475569; margin-bottom: 5px; font-size: 13px; text-transform: uppercase;">Horário Início Diário</label>
                <input type="time" name="hora_inicio" id="fHoraIni" style="width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 15px;" />
              </div>
              <div style="flex: 1;">
                <label style="display: block; font-weight: bold; color: #475569; margin-bottom: 5px; font-size: 13px; text-transform: uppercase;">Horário Fim Diário</label>
                <input type="time" name="hora_fim" id="fHoraFim" style="width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 15px;" />
              </div>
            </div>
        </div>

        <h3 style="margin-top: 0; color: #334155; margin-bottom: 10px; font-size: 18px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px;">🏷️ Classes da Competição <span style="color:red;">*</span></h3>
        <p style="font-size: 13px; color: #64748b; margin-top: 0; margin-bottom: 15px;">Clique na caixa abaixo para adicionar ou remover as classes que farão parte do torneio.</p>
        
        <div id="classesSelectorContainer" style="position: relative; margin-bottom: 30px;">
          <div class="multi-select-container" style="min-height: 50px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #f8fafc; cursor: pointer; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; transition: border-color 0.2s;">
            <span class="multi-select-placeholder" style="color: #94a3b8; font-style: italic;">Carregando classes disponíveis...</span>
          </div>
          <div class="multi-select-dropdown" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; max-height: 250px; overflow-y: auto; z-index: 100; box-shadow: 0 10px 25px rgba(0,0,0,0.15); margin-top: 5px;"></div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 15px; border-top: 2px solid #e2e8f0; padding-top: 20px;">
          <button type="button" id="btnCancel" style="background: transparent; border: 1px solid #94a3b8; color: #475569; padding: 12px 25px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s;">Cancelar</button>
          <button type="submit" id="btnSave" style="background: #3b82f6; color: white; border: none; padding: 12px 30px; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer; box-shadow: 0 4px 6px rgba(59,130,246,0.3); transition: 0.2s;">
            ${isEdit ? '💾 Salvar Alterações' : '✨ Criar Competição'}
          </button>
        </div>
      </form>
    </section>
  `;

  const titleEl = root.querySelector('#compNewTitle');
  titleEl.textContent = isEdit ? 'Editar Competição' : 'Nova Competição';

  const btnBack = root.querySelector('#btnBack');
  const btnCancel = root.querySelector('#btnCancel');
  
  // Rota dinâmica: Se estava editando, volta para a tela de View da competição. Se não, volta para a lista.
  const backUrl = isEdit ? `#/competitions/view?id=${state.competitionId}` : '#/competitions/load';
  btnBack.addEventListener('click', () => { location.hash = backUrl; });
  btnCancel.addEventListener('click', () => { location.hash = backUrl; });

  const form = root.querySelector('#compForm');
  const classesSelectorContainer = root.querySelector('#classesSelectorContainer');
  const chipsContainer = classesSelectorContainer.querySelector('.multi-select-container');
  const dropdown = classesSelectorContainer.querySelector('.multi-select-dropdown');
  const btnSave = root.querySelector('#btnSave');

  state.classesUI = { chipsContainer, dropdown };

  // Efeitos visuais hover
  btnBack.addEventListener('mouseover', () => btnBack.style.background = '#e2e8f0');
  btnBack.addEventListener('mouseout', () => btnBack.style.background = '#f1f5f9');
  btnSave.addEventListener('mouseover', () => btnSave.style.background = '#2563eb');
  btnSave.addEventListener('mouseout', () => btnSave.style.background = '#3b82f6');

  chipsContainer.addEventListener('click', (ev) => {
    ev.stopPropagation();
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
    chipsContainer.style.borderColor = dropdown.style.display === 'block' ? '#3b82f6' : '#cbd5e1';
  });
  
  document.addEventListener('click', (ev) => {
    if (!classesSelectorContainer.contains(ev.target)) {
      dropdown.style.display = 'none';
      chipsContainer.style.borderColor = '#cbd5e1';
    }
  });

  function renderClassDropdownOptions() {
    dropdown.innerHTML = '';
    const classesJaRenderizadas = new Set();

    state.allClasses.forEach((cls) => {
      const code = (cls.code || cls.codigo || cls.class_code || cls.id || '').trim();
      if (!code || classesJaRenderizadas.has(code)) return; 
      classesJaRenderizadas.add(code);

      const isSelected = state.selectedClassCodes.has(code);
      const option = document.createElement('div');
      option.style.padding = '12px 15px';
      option.style.cursor = 'pointer';
      option.style.borderBottom = '1px solid #f1f5f9';
      option.style.background = isSelected ? '#eff6ff' : '#fff';
      option.style.fontWeight = isSelected ? 'bold' : 'normal';
      option.style.color = isSelected ? '#2563eb' : '#334155';
      
      option.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" ${isSelected ? 'checked' : ''} style="pointer-events: none; transform: scale(1.2);"> 
            <span>${code} ${cls.name || cls.nome || cls.description || ''}</span>
        </div>
      `;
      
      option.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (state.selectedClassCodes.has(code)) state.selectedClassCodes.delete(code);
        else state.selectedClassCodes.add(code);
        renderSelectedClassChips();
        renderClassDropdownOptions();
      });
      
      dropdown.appendChild(option);
    });
  }

  function renderSelectedClassChips() {
    chipsContainer.innerHTML = '';

    if (state.selectedClassCodes.size === 0) {
      chipsContainer.innerHTML = '<span style="color: #94a3b8; font-style: italic;">Clique aqui para selecionar classes...</span>';
      return;
    }

    state.selectedClassCodes.forEach((code) => {
      const chip = document.createElement('div');
      chip.style.background = '#0f172a';
      chip.style.color = '#fff';
      chip.style.padding = '6px 12px';
      chip.style.borderRadius = '20px';
      chip.style.fontSize = '13px';
      chip.style.fontWeight = 'bold';
      chip.style.display = 'flex';
      chip.style.alignItems = 'center';
      chip.style.gap = '8px';
      chip.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';

      const text = document.createElement('span');
      text.textContent = code; 

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.innerHTML = '&times;';
      closeBtn.style.background = 'transparent';
      closeBtn.style.border = 'none';
      closeBtn.style.color = '#fca5a5';
      closeBtn.style.cursor = 'pointer';
      closeBtn.style.fontSize = '18px';
      closeBtn.style.lineHeight = '1';
      closeBtn.style.padding = '0';
      closeBtn.title = "Remover classe";
      
      closeBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        state.selectedClassCodes.delete(code);
        renderSelectedClassChips();
        renderClassDropdownOptions();
      });

      chip.appendChild(text);
      chip.appendChild(closeBtn);
      chipsContainer.appendChild(chip);
    });
  }

  try {
    // Busca Classes do BD, e se for Edição, busca os dados da Competição
    const [dd, existingComp, compCls] = await Promise.all([
      API.getClassesDropdown(),
      isEdit ? API.getCompetition(state.competitionId) : Promise.resolve(null),
      isEdit ? API.getCompetitionClasses(state.competitionId) : Promise.resolve(null),
    ]);

    state.allClasses = dd.items || dd.data || [];

    // AUTO-PREENCHIMENTO DE EDIÇÃO
    if (isEdit && existingComp) {
      form.fNome.value = existingComp.nome || existingComp.name || '';
      form.fLocal.value = existingComp.local || '';
      form.fDataIni.value = toInputDate(existingComp.data_inicio || existingComp.start_date);
      form.fDataFim.value = toInputDate(existingComp.data_fim || existingComp.end_date);
      
      const metodo = (existingComp.metodo || existingComp.method || existingComp.tipo || 'ELIMINATORIA').toUpperCase();
      form.fMetodo.value = METODO_NORMALIZADO(metodo);
      
      if (form.fNivel && existingComp.nivel) form.fNivel.value = existingComp.nivel;
      form.fQuadras.value = existingComp.num_quadras ?? '';
      form.fHoraIni.value = (existingComp.hora_inicio || '').slice(0, 5);
      form.fHoraFim.value = (existingComp.hora_fim || '').slice(0, 5);
    }

    state.selectedClassCodes.clear();
    
    // PREENCHE AS CLASSES JÁ SELECIONADAS NA EDIÇÃO
    if (isEdit && compCls) {
      const items = compCls.items || compCls.data || [];
      items.forEach((c) => {
        const code = (c.class_code || c.code || c.codigo || '').trim();
        if (code) state.selectedClassCodes.add(code);
      });
    }

    renderClassDropdownOptions();
    renderSelectedClassChips();
  } catch (err) {
    console.error(err);
    chipsContainer.innerHTML = `<span style="color:red; font-weight:bold;">Erro ao carregar dados do servidor.</span>`;
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const nome = form.fNome.value.trim();
    const local = form.fLocal.value.trim();
    const metodo = METODO_NORMALIZADO(form.fMetodo.value);
    const nivel = form.fNivel.value || null; 
    const data_inicio = fromInputDate(form.fDataIni.value);
    const data_fim = fromInputDate(form.fDataFim.value);

    // Validação básica
    if (!nome || !local || !data_inicio || !data_fim || !metodo) {
      showFormError(form, 'Atenção: Preencha Nome, Local, Método e as Datas de Início e Fim.');
      return;
    }

    const num_quadras = form.fQuadras.value ? parseInt(form.fQuadras.value, 10) : null;
    const hora_inicio = form.fHoraIni.value || null;
    const hora_fim = form.fHoraFim.value || null;
    const classes = Array.from(state.selectedClassCodes);

    const payload = { nome, name: nome, local, metodo, tipo: metodo, nivel, data_inicio, start_date: data_inicio, data_fim, end_date: data_fim, num_quadras, hora_inicio, hora_fim, classes };

    if (classes.length === 0) {
      showFormError(form, 'Atenção: Você precisa selecionar pelo menos uma Classe para esta competição.');
      return;
    }

    // Trava o botão
    btnSave.disabled = true;
    btnSave.textContent = 'Aguarde... Salvando...';

    try {
      if (isEdit) {
        await API.updateCompetition(state.competitionId, payload);
        window.__toast?.('Competição atualizada com sucesso!', 'success');
        location.hash = `#/competitions/view?id=${state.competitionId}`;
      } else {
        await API.createCompetition(payload);
        window.__toast?.('Competição criada com sucesso!', 'success');
        location.hash = '#/competitions/load';
      }
    } catch (err) {
      console.error(err);
      showFormError(form, err?.error || 'Ocorreu um erro ao salvar no banco de dados. Tente novamente.');
      btnSave.disabled = false;
      btnSave.textContent = isEdit ? '💾 Salvar Alterações' : '✨ Criar Competição';
    }
  });
}

// Garante que o roteador encontre a tela independentemente de qual nome ele usar (new ou edit)
export const renderCompetitionEdit = renderCompetitionNew;
export default renderCompetitionNew;