// client/js/pages/competitions.js

import { db } from '../firebase-config.js';
import { collection, getDocs, doc, setDoc, addDoc, deleteDoc, query, where, orderBy, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
// 🔥 IMPORTAÇÃO DO CÉREBRO DE PERMISSÕES
import { canEditGlobal } from '../permissions.js';

// ================= API =================
const API = {
  list: async (params = {}) => {
    let items = [];
    try {
      // Tenta buscar já ordenado do Firebase
      const q = query(collection(db, "competitions"), orderBy("created_at", "desc"));
      const snap = await getDocs(q);
      items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch(e) { 
      // PLANO B SEGURO: Se o Firebase bloquear por falta de índice, puxa tudo sem ordem
      console.warn("Fallback ativado (sem orderBy):", e);
      const snap = await getDocs(collection(db, "competitions"));
      items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    // Filtra: Mostra apenas competições ATIVAS (esconde as que já foram para o histórico/resultados)
    let filtered = items.filter(i => 
        i.historica_csv !== true && 
        i.historica_csv !== "true" && 
        i.historica_csv !== 1 && 
        i.historica_csv !== "1"
    );

    // Filtro de busca por texto (input do usuário)
    if (params.q) {
       const term = params.q.toLowerCase();
       filtered = filtered.filter(i => 
           (i.nome && i.nome.toLowerCase().includes(term)) || 
           (i.name && i.name.toLowerCase().includes(term)) || 
           (i.local && i.local.toLowerCase().includes(term))
       );
    }

    // Ordenação manual no navegador (garante que a última criada fique no topo, mesmo no Plano B)
    filtered.sort((a, b) => {
        const dA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dB - dA;
    });

    return { items: filtered, total: filtered.length };
  },
  
  // FUNÇÕES PARA A TELA DE EDIÇÃO/CRIAÇÃO
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
        
        await updateDoc(doc(db, "competitions", String(id)), payload);
        
        const q = query(collection(db, "competition_classes"), where("competition_id", "==", String(id)));
        const snap = await getDocs(q);
        const delPromises = snap.docs.map(d => deleteDoc(doc(db, "competition_classes", d.id)));
        await Promise.all(delPromises);

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
  
  reset: async (id) => {
    try {
        const queries = [
            query(collection(db, "draws"), where("competition_id", "==", String(id))),
            query(collection(db, "matches_group"), where("competition_id", "==", String(id))),
            query(collection(db, "matches_ko"), where("competition_id", "==", String(id))),
            query(collection(db, "time_slots"), where("competition_id", "==", String(id)))
        ];
        for (let q of queries) {
            const snap = await getDocs(q);
            snap.forEach(async (d) => { await deleteDoc(doc(db, d.ref.parent.path, d.id)); });
        }
        return { success: true };
    } catch(e) { throw { error: 'Falha ao resetar no Firebase' }; }
  },
  remove: async (id) => {
    try {
        await API.reset(id);
        const qClasses = query(collection(db, "competition_classes"), where("competition_id", "==", String(id)));
        const snapClasses = await getDocs(qClasses);
        snapClasses.forEach(async (d) => { await deleteDoc(doc(db, "competition_classes", d.id)); });
        
        const qOff = query(collection(db, "competition_officials"), where("competition_id", "==", String(id)));
        const snapOff = await getDocs(qOff);
        snapOff.forEach(async (d) => { await deleteDoc(doc(db, "competition_officials", d.id)); });

        await deleteDoc(doc(db, "competitions", String(id)));
        return { success: true };
    } catch(e) { throw { error: 'Falha ao deletar do Firebase' }; }
  },
};

// ================= helpers =================
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  const dd = String(dt.getDate() + 1).padStart(2,'0'); 
  const mm = String(dt.getMonth()+1).padStart(2,'0');
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
function fmtDateRange(ini, fim){
  if (ini && fim) return `${fmtDate(ini)} – ${fmtDate(fim)}`;
  return fmtDate(ini || fim);
}
function escapeHTML(s=''){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]); }

// ============================================================
//   LISTA INTELIGENTE (#/competitions/load) 
// ============================================================
export async function renderLoadCompetition(root) {
  // 🔥 VERIFICA SE O USUÁRIO PODE EDITAR COMPETIÇÕES GLOBAIS
  const canEdit = canEditGlobal('competicoes');

  root.innerHTML = `
    <section>
      <h1 tabindex="-1">Campeonatos em Andamento</h1>

      <div class="toolbar" style="margin:8px 0 12px; display: flex; gap: 8px;">
        <input id="q" type="search" placeholder="Buscar campeonato ou cidade…" aria-label="Buscar" style="flex:1;" />
        <button class="ghostbtn" id="btnSearch">Buscar</button>
        
        <div id="adminPanel" style="display: ${canEdit ? 'block' : 'none'};">
          <a class="btn" href="#/competitions/new" id="btnNew">Criar competição</a>
        </div>
      </div>

      <div id="listWrap" aria-busy="true"></div>
    </section>
  `;

  const listWrap = root.querySelector('#listWrap');
  const qEl = root.querySelector('#q');
  const btnSearch = root.querySelector('#btnSearch');

  const renderList = (items = []) => {
    if (!items.length) {
      listWrap.innerHTML = `<p>Nenhum campeonato em andamento encontrado.</p>`;
      return;
    }

    const html = `
      <div class="cards comp-grid" role="list">
        ${items.map(it => {
          const href = `#/competitions/view?id=${encodeURIComponent(it.id||'')}`;
          const mid = `m_${it.id}`;
          const period = fmtDateRange(it.data_inicio || it.start_date, it.data_fim || it.end_date);
          
          // 🔥 SÓ MOSTRA O MENU DE 3 PONTINHOS SE TIVER PERMISSÃO DE EDIÇÃO
          const adminMenu = canEdit ? `
            <button class="menu-dot" aria-haspopup="true" aria-expanded="false" data-menu="${mid}" title="Mais ações">⋯</button>
            <div id="${mid}" class="menu-panel" hidden role="menu">
              <button class="ghostbtn" data-act="edit" data-id="${it.id}" role="menuitem">✏️ Editar Info</button>
              <button class="ghostbtn" data-act="resultado" data-id="${it.id}" role="menuitem">📊 Resultado</button>
              <button class="ghostbtn" data-act="relatorio" data-id="${it.id}" role="menuitem">📄 Relatório</button>
              <hr class="menu-sep">
              <button class="ghostbtn warning" data-act="reset" data-id="${it.id}" role="menuitem">🧹 Apagar Sorteios e Jogos</button>
              <button class="ghostbtn danger" data-act="delete" data-id="${it.id}" role="menuitem">🗑️ Excluir Competição</button>
            </div>
          ` : '';

          return `
            <div class="card comp-card" role="listitem">
              ${adminMenu}

              <div class="icon" aria-hidden="true" style="color: #3b82f6;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>
              </div>

              <div class="card-title comp-title">${escapeHTML(it.nome || it.name || '')}</div>
              <div class="card-sub comp-date">${escapeHTML(period)}</div>

              <div class="comp-label">Local</div>
              <div class="card-sub comp-loc">${escapeHTML(it.local || it.location || '')}</div>

              <a class="btn comp-select" href="${href}" style="${!canEdit ? 'background: #1e293b; color: #fff;' : ''}">${canEdit ? 'Gerenciar' : 'Acompanhar'}</a>
            </div>
          `;
        }).join('')}
      </div>
    `;
    listWrap.innerHTML = html;

    const style = document.createElement('style');
    style.textContent = `
      .comp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; justify-items: start; align-items: start; }
      .comp-card { position: relative; max-width: 320px; width: 100%; min-height: 230px; padding: 16px; align-items: flex-start; justify-content: flex-start; overflow: hidden; border-radius: 12px; transition: transform 0.2s; }
      .comp-card:hover { transform: translateY(-4px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
      .comp-card .icon svg { width:28px; height:28px; }
      .comp-title { font-size:18px; margin-top:8px; font-weight: 700; color: #0f172a; }
      .comp-date { margin:4px 0 12px; color: #64748b; font-size: 13px; }
      .comp-label { font-size:11px; font-weight:700; text-transform: uppercase; letter-spacing: 0.5px; color:var(--muted); margin-top:auto; }
      .comp-loc { margin-top:2px; font-weight: 500; margin-bottom: 16px; }
      .comp-select { width:100%; text-align:center; padding:10px; border-radius:8px; font-weight: 600; }
      
      .menu-dot { position:absolute; top:12px; right:12px; width:30px; height:30px; border:1px solid var(--card-border); border-radius:8px; background:var(--btn-bg); color:var(--fg); line-height:0; display:inline-flex; align-items:center; justify-content:center; opacity:.8; cursor:pointer; font-size: 18px; }
      .menu-dot:hover { opacity:1; outline:2px solid transparent; background: #e2e8f0; }
      .menu-panel[hidden]{ display:none !important; }
      .menu-panel { position:absolute; right:12px; top:46px; z-index:10; background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 8px; min-width: 210px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2); }
      .menu-panel .ghostbtn { width:100%; text-align:left; padding: 10px 12px; font-weight: 600; cursor: pointer; border: none; background: transparent; border-radius: 6px; }
      .menu-panel .ghostbtn:hover { background: var(--bg); }
      .menu-panel .danger { color:#dc3545; }
      .menu-panel .warning { color:#f59e0b; }
      .menu-panel .menu-sep { width:100%; border:none; border-top:1px solid var(--card-border); margin:6px 0; }
    `;
    listWrap.appendChild(style);

    // 🔥 SÓ ATIVA OS EVENTOS DO MENU SE ELE EXISTIR (canEdit = true)
    if (canEdit) {
      const closeAll = () => listWrap.querySelectorAll('.menu-panel').forEach(p => p.setAttribute('hidden',''));

      listWrap.querySelectorAll('button[data-menu]').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const id = btn.getAttribute('data-menu');
          const panel = listWrap.querySelector('#' + CSS.escape(id));
          const willOpen = panel.hasAttribute('hidden');
          closeAll();
          if (willOpen) {
            panel.removeAttribute('hidden');
            btn.setAttribute('aria-expanded','true');
          } else {
            panel.setAttribute('hidden','');
            btn.setAttribute('aria-expanded','false');
          }
        });
      });
      document.addEventListener('click', (ev) => { if (!listWrap.contains(ev.target)) closeAll(); }, true);

      listWrap.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', async (ev) => {
          ev.preventDefault();
          const act = btn.getAttribute('data-act');
          const id  = btn.getAttribute('data-id');

          if (act === 'edit') {
            location.hash = `#/competitions/new?id=${encodeURIComponent(id)}`;
            closeAll();
            return;
          }

          if (act === 'relatorio') { 
              location.hash = `#/competitions/report?id=${encodeURIComponent(id)}`; 
              closeAll(); 
              return; 
          }
          if (act === 'resultado') { 
              location.hash = `#/competitions/final-results?id=${encodeURIComponent(id)}`; 
              closeAll(); 
              return; 
          }
          
          if (act === 'reset') {
            if (!confirm('Tem certeza que deseja APAGAR TODOS OS JOGOS, SORTEIOS e PLACARES desta competição?\nOs atletas inscritos serão mantidos.')) return;
            try {
              await API.reset(id);
              if (window.__toast) window.__toast('Sorteios e Jogos apagados.', 'info');
              else alert('Sorteios e Jogos apagados.');
            } catch (e) {
              if (window.__toast) window.__toast(e?.error || 'Erro ao resetar', 'error');
              else alert('Erro ao resetar');
            } finally {
              closeAll();
            }
            return;
          }

          if (act === 'delete') {
            if (!confirm('Excluir definitivamente esta competição? Esta ação não pode ser desfeita e apagará os atletas vinculados, as súmulas e o sorteio.')) return;
            try { 
                await API.remove(id); 
                if (window.__toast) window.__toast('Competição deletada.', 'info'); 
                else alert('Competição deletada com sucesso.');
            } catch (e) { 
                if (window.__toast) window.__toast(e?.error || 'Falha ao deletar', 'error'); 
                else alert('Falha ao deletar');
            } finally { 
                closeAll(); 
                load(); 
            }
            return;
          }
        });
      });
    }
  };

  const load = async () => {
    listWrap.setAttribute('aria-busy','true');
    try {
      const { items = [] } = await API.list({ q: qEl.value?.trim() });
      renderList(items);
    } catch (e) {
      listWrap.innerHTML = `<p>Falha ao carregar lista de campeonatos.</p>`;
    } finally {
      listWrap.setAttribute('aria-busy','false');
    }
  };

  btnSearch.addEventListener('click', load);
  qEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });

  // A tela já foi desenhada baseada na permissão. Se mudar, o main.js cuida de atualizar.
  await load();
}

// ============================================================
//   TELA DE NOVA COMPETIÇÃO (E EDIÇÃO) (#/competitions/new)
// ============================================================

function getQuery(hash) {
  const idx = hash.indexOf('?');
  const q = idx >= 0 ? hash.slice(idx + 1) : '';
  const p = new URLSearchParams(q);
  const o = {};
  for (const [k, v] of p.entries()) o[k] = v;
  return o;
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
    form.appendChild(el);
  }
  el.textContent = msg;
}

const state = {
  competitionId: null,
  allClasses: [],              
  selectedClassCodes: new Set(),  
  classesUI: null,              
};

export async function renderCompetitionNew(root, hash) {
  // 🔥 PROTEÇÃO DA ROTA (Nenhum espertinho cria campeonato via URL)
  if (!canEditGlobal('competicoes')) {
      window.__toast?.('Acesso Negado.', 'error');
      location.hash = '#/competitions/load';
      return;
  }

  const currentHash = hash || window.location.hash;
  const { id } = getQuery(currentHash);
  
  state.competitionId = id;
  const isEdit = !!state.competitionId;

  root.innerHTML = `
    <section class="comp-new">
      <header class="comp-new-head">
        <button type="button" class="comp-new-back" id="btnBack">&larr; Voltar</button>
        <h1 id="compNewTitle" tabindex="-1">Carregando...</h1>
      </header>

      <form id="compForm" class="comp-new-form" novalidate>
        <div class="comp-new-grid">
          <section class="comp-new-section">
            <h2>Dados da competição</h2>
            <div class="field">
              <label>Nome da competição<span class="req">*</span>
                <input type="text" name="nome" id="fNome" required />
              </label>
            </div>
            <div class="field">
              <label>Local<span class="req">*</span>
                <input type="text" name="local" id="fLocal" required />
              </label>
            </div>

            <div class="field-row two-columns">
              <div class="field">
                <label>Método da competição<span class="req">*</span>
                  <select name="metodo" id="fMetodo" required>
                    <option value="ELIMINATORIA" selected>Eliminatória Direta (Mata-Mata)</option>
                    <option value="WORLD_BOCCIA">World Boccia (Fase de Grupos)</option>
                  </select>
                </label>
              </div>
              <div class="field">
                <label>Nível da competição
                  <select name="nivel" id="fNivel">
                    <option value="">Selecione o nível</option>
                    <option value="Local">Local</option>
                    <option value="Estadual">Estadual</option>
                    <option value="Regional">Regional</option>
                    <option value="Nacional">Nacional</option>
                    <option value="Internacional">Internacional</option>
                  </select>
                </label>
              </div>
            </div>

            <div class="field-row">
              <label>Data início<span class="req">*</span>
                <input type="date" name="data_inicio" id="fDataIni" required />
              </label>
              <label>Data fim<span class="req">*</span>
                <input type="date" name="data_fim" id="fDataFim" required />
              </label>
            </div>
            <div class="field-row">
              <label>Nº de quadras
                <input type="number" name="num_quadras" id="fQuadras" min="1" step="1" />
              </label>
            </div>
            <div class="field-row">
              <label>Janela diária - início
                <input type="time" name="hora_inicio" id="fHoraIni" />
              </label>
              <label>Janela diária - fim
                <input type="time" name="hora_fim" id="fHoraFim" />
              </label>
            </div>
          </section>

          <section class="comp-new-section">
            <h2>Classes na competição<span class="req">*</span></h2>
            <p class="hint">Selecione as classes que vão fazer parte desta competição.</p>
            <div id="classesSelectorContainer" class="comp-classes-list" aria-busy="true">
              <div class="multi-select-container" tabindex="0">
                <div class="multi-select-chips">
                  <span class="multi-select-placeholder">Carregando classes...</span>
                </div>
              </div>
              <div class="multi-select-dropdown" style="display: none;"></div>
            </div>
          </section>
        </div>

        <footer class="comp-new-footer">
          <button type="button" class="btn ghost" id="btnCancel">Cancelar</button>
          <button type="submit" class="btn primary" id="btnSave">
            ${isEdit ? 'Salvar Alterações' : 'Criar Competição'}
          </button>
        </footer>
      </form>
    </section>
  `;

  addPageStyles();

  const titleEl = root.querySelector('#compNewTitle');
  titleEl.textContent = isEdit ? 'Editar Competição' : 'Nova Competição';
  titleEl.focus();

  const btnBack = root.querySelector('#btnBack');
  const btnCancel = root.querySelector('#btnCancel');
  const backUrl = isEdit ? `#/competitions/view?id=${state.competitionId}` : '#/competitions/load';
  btnBack.addEventListener('click', () => { location.hash = backUrl; });
  btnCancel.addEventListener('click', () => { location.hash = backUrl; });

  const form = root.querySelector('#compForm');
  const classesSelectorContainer = root.querySelector('#classesSelectorContainer');
  const btnSave = root.querySelector('#btnSave');

  state.classesUI = {
    chipsContainer: classesSelectorContainer.querySelector('.multi-select-chips'),
    dropdown: classesSelectorContainer.querySelector('.multi-select-dropdown'),
  };

  classesSelectorContainer.querySelector('.multi-select-container').addEventListener('click', () => {
    toggleDropdown(true);
  });
  document.addEventListener('click', (ev) => {
    if (!classesSelectorContainer.contains(ev.target)) {
      toggleDropdown(false);
    }
  });

  try {
    const [dd, existingComp, compCls] = await Promise.all([
      API.getClassesDropdown(),
      isEdit ? API.getCompetition(state.competitionId) : Promise.resolve(null),
      isEdit ? API.getCompetitionClasses(state.competitionId) : Promise.resolve(null),
    ]);

    state.allClasses = dd.items || dd.data || [];

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
    if (isEdit && compCls) {
      const items = compCls.items || compCls.data || [];
      items.forEach((c) => {
        const code = (c.class_code || c.code || c.codigo || '').trim();
        if (code) state.selectedClassCodes.add(code);
      });
    }

    renderClassDropdownOptions();
    renderSelectedClassChips();
    classesSelectorContainer.setAttribute('aria-busy', 'false');
  } catch (err) {
    console.error(err);
    classesSelectorContainer.innerHTML = `<p class="comp-error">${escapeHTML(err?.error || 'Falha ao carregar dados.')}</p>`;
    classesSelectorContainer.setAttribute('aria-busy', 'false');
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const nome = form.fNome.value.trim();
    const local = form.fLocal.value.trim();
    const metodo = METODO_NORMALIZADO(form.fMetodo.value);
    const nivel = form.fNivel.value || null; 
    const data_inicio = fromInputDate(form.fDataIni.value);
    const data_fim = fromInputDate(form.fDataFim.value);

    if (!nome || !local || !data_inicio || !data_fim || !metodo) {
      showFormError(form, 'Preencha Nome, Local, Método e as datas de início/fim.');
      return;
    }

    const num_quadras = form.fQuadras.value ? parseInt(form.fQuadras.value, 10) : null;
    const hora_inicio = form.fHoraIni.value || null;
    const hora_fim = form.fHoraFim.value || null;
    const classes = Array.from(state.selectedClassCodes);

    const payload = { nome, name: nome, local, metodo, tipo: metodo, nivel, data_inicio, start_date: data_inicio, data_fim, end_date: data_fim, num_quadras, hora_inicio, hora_fim, classes };

    if (classes.length === 0) {
      showFormError(form, 'Selecione pelo menos uma classe para a competição.');
      return;
    }

    btnSave.disabled = true;
    btnSave.textContent = 'Salvando...';

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
      showFormError(form, err?.error || 'Falha ao salvar no Firebase.');
      btnSave.disabled = false;
      btnSave.textContent = isEdit ? 'Salvar Alterações' : 'Criar Competição';
    }
  });
}

function toggleDropdown(show) {
  if (!state.classesUI) return;
  state.classesUI.dropdown.style.display = show ? 'block' : 'none';
}

function renderClassDropdownOptions() {
  if (!state.classesUI) return;
  const { dropdown } = state.classesUI;
  dropdown.innerHTML = '';

  const classesJaRenderizadas = new Set();

  state.allClasses.forEach((cls) => {
    const code = (cls.code || cls.codigo || cls.class_code || cls.id || '').trim();
    
    if (classesJaRenderizadas.has(code)) return; 
    classesJaRenderizadas.add(code);

    const option = document.createElement('div');
    option.className = 'multi-select-option';
    option.dataset.code = code; 
    option.textContent = `${code} ${cls.description || ''}`.trim(); 
    
    if (state.selectedClassCodes.has(code)) {
      option.classList.add('selected');
    }
    
    option.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleClassSelection(code);
    });
    
    dropdown.appendChild(option);
  });
}

function toggleClassSelection(classCode) {
  if (state.selectedClassCodes.has(classCode)) state.selectedClassCodes.delete(classCode);
  else state.selectedClassCodes.add(classCode);
  renderSelectedClassChips();
  renderClassDropdownOptions();
}

function renderSelectedClassChips() {
  if (!state.classesUI) return;
  const { chipsContainer } = state.classesUI;
  chipsContainer.innerHTML = '';

  if (state.selectedClassCodes.size === 0) {
    const placeholder = document.createElement('span');
    placeholder.className = 'multi-select-placeholder';
    placeholder.textContent = 'Selecione uma ou mais classes...';
    chipsContainer.appendChild(placeholder);
    return;
  }

  state.selectedClassCodes.forEach((code) => {
    const chip = document.createElement('span');
    chip.className = 'multi-select-chip';

    const text = document.createElement('span');
    text.textContent = code; 

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'multi-select-chip-remove';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleClassSelection(code);
    });

    chip.appendChild(text);
    chip.appendChild(closeBtn);
    chipsContainer.appendChild(chip);
  });
}

function addPageStyles() {
  const styleId = 'competition-new-page-styles';
  if (document.getElementById(styleId)) return; 
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .comp-new { max-width: 980px; margin: 0 auto; padding: 8px; }
    .comp-new-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
    .comp-new-back { border:1px solid #ccc; background:#f7f7f7; border-radius:8px; padding:4px 8px; cursor:pointer; font-weight: 500;}
    .comp-new-head h1 { margin:0; font-size:18px; text-transform:uppercase; }
    .comp-new-form { border:1px solid #ddd; border-radius:12px; padding:10px 12px; background:#fff; position: relative; }
    .comp-new-grid { display:grid; grid-template-columns: 1.25fr 1fr; gap:12px; }
    .comp-new-section h2 { margin:0 0 8px; font-size:15px; color:#666; text-transform:uppercase; }
    .field { margin-bottom:8px; }
    .field-row { display:flex; gap:10px; margin-bottom:8px; }
    .field-row > label, .field-row > .field { flex:1; }
    .field label { display:block; font-size:13px; color:#666; margin-bottom:2px; font-weight: 600; }
    .field input, .field select { width:100%; padding:6px 8px; border:1px solid #ccc; border-radius:6px; font-size:14px; box-sizing:border-box; }
    .comp-new-footer { display:flex; justify-content:flex-end; gap:8px; margin-top:10px; border-top:1px solid #ddd; padding-top:12px; }
    .btn { font-size:13px; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight: 600;}
    .btn.primary { background:#3b5ddd; color:#fff; border:none; }
    
    #classesSelectorContainer { position: relative; }
    .multi-select-container { min-height: 40px; border: 1px solid #ccc; border-radius: 6px; padding: 6px; background: #fff; cursor: pointer; }
    .multi-select-chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .multi-select-chip { background: #000; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 12px; display: flex; align-items: center; }
    .multi-select-chip-remove { background: none; border: none; color: #fff; cursor: pointer; margin-left: 4px; }
    .multi-select-dropdown { 
        position: absolute; 
        top: 100%; 
        left: 0; 
        right: 0; 
        background: #fff; 
        border: 1px solid #ddd; 
        border-radius: 6px; 
        max-height: 200px; 
        overflow-y: auto; 
        z-index: 9999; 
        box-shadow: 0 4px 12px rgba(0,0,0,0.15); 
    }
    .multi-select-option { padding: 8px 12px; cursor: pointer; font-size: 14px; }
    .multi-select-option:hover { background: #f0f0f0; }
    .multi-select-option.selected { background: #e0e0e0; font-weight: bold; }
  `;
  document.head.appendChild(style);
}

export default { renderLoadCompetition, renderCompetitionNew };