// client/js/pages/avaliacao-externa.js

import { db } from '../firebase-config.js';
import { collection, getDocs, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
      { id: "c33_4", texto: "Entrega a bola-alvo, posiciona-se fora da quadra, gesticula e anuncia \"Bola-alvo\"", peso: 0.1 },
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

function escapeHTML(s = '') {
    return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function getDeviceInfo() {
    const ua = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(ua)) return "Tablet";
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) return "Telemóvel (Smartphone)";
    return "Computador / Notebook";
}

// 🔥 NOVO MOTOR MATEMÁTICO PROPORCIONAL 🔥
function calcularTotalProporcional(notasObj) {
    let totalGeral = 0;

    CRITERIOS_PRATICA.forEach(grupo => {
        let maxGrupo = 0;
        let pesoObservado = 0;
        let pontosObtidosRaw = 0;

        grupo.itens.forEach(item => {
            maxGrupo += item.peso;
            const val = notasObj["crit_" + item.id];
            
            // Se foi avaliado (não é NO e não está vazio)
            if (val !== "NO" && val !== undefined && val !== "") {
                pesoObservado += item.peso;
                let multiplicador = parseFloat(val); // "1" (100%), "0.5" (50%), "0" (0%)
                if (!isNaN(multiplicador)) {
                    pontosObtidosRaw += (multiplicador * item.peso);
                }
            }
        });

        // Redistribui o peso do bloco pelos itens que foram observados
        if (pesoObservado > 0) {
            const fatorCorrecao = maxGrupo / pesoObservado;
            totalGeral += (pontosObtidosRaw * fatorCorrecao);
        } else if (pesoObservado === 0 && maxGrupo > 0) {
            // Se NENHUM item do bloco inteiro foi observado, não penaliza o aluno
            totalGeral += maxGrupo;
        }
    });

    return totalGeral;
}

export async function renderAvaliacaoExterna(root, hash) {
    root.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; height: 50vh; flex-direction: column; font-family: sans-serif;">
            <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #16a34a; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <p style="margin-top: 15px; color: #64748b; font-weight:bold;">A procurar Cursistas na Base de Dados...</p>
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
        </div>
    `;

    try {
        const snap = await getDocs(collection(db, "referees"));
        let cursistas = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.nivel === 'Cursista') {
                cursistas.push({ id: d.id, ...data });
            }
        });

        cursistas.sort((a, b) => (a.nome_completo || '').localeCompare(b.nome_completo || ''));

        if (cursistas.length === 0) {
            root.innerHTML = `
                <div style="padding: 40px 20px; text-align: center; font-family: sans-serif; background:#f8fafc; min-height:100vh;">
                    <div style="background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); max-width: 500px; margin: 0 auto; border-top: 4px solid #ef4444;">
                        <h2 style="color: #ef4444; margin-top:0;">Nenhum Cursista Encontrado</h2>
                        <p style="color: #64748b; font-size:15px;">Não há árbitros com o nível "Cursista" registados no sistema de momento. Peça à organização para verificar os registos.</p>
                    </div>
                </div>
            `;
            return;
        }

        let cursistasOptions = `<option value="">-- Escolha quem vai avaliar --</option>`;
        cursistas.forEach(c => {
            cursistasOptions += `<option value="${c.id}">${escapeHTML(c.nome_completo)} (${escapeHTML(c.uf)})</option>`;
        });

        let htmlCriterios = '';
        CRITERIOS_PRATICA.forEach((grupo) => {
            htmlCriterios += `
                <div style="background: #e2e8f0; color: #0f172a; padding: 12px 15px; font-weight: bold; font-size: 14px; margin-top: 25px; border-radius: 8px 8px 0 0;">
                    ${grupo.grupo}
                </div>
                <div style="background: white; border: 1px solid #cbd5e1; border-top: none; border-radius: 0 0 8px 8px; padding: 10px;">
            `;

            grupo.itens.forEach((item, iIdx) => {
                const borderBottom = iIdx < grupo.itens.length - 1 ? 'border-bottom: 1px solid #f1f5f9;' : '';
                htmlCriterios += `
                    <div style="padding: 15px 0; ${borderBottom}">
                        <div style="font-size: 14px; color: #334155; font-weight: 500; margin-bottom: 12px; line-height: 1.4;">
                            ${item.texto} <strong style="color: #2563eb;">(${item.peso.toFixed(1)})</strong>
                        </div>
                        <div style="display: flex; gap: 5px;">
                            <label style="flex: 1; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 8px 2px; border-radius: 6px; text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 5px; transition:0.2s;">
                                <input type="radio" name="crit_${item.id}" value="1" class="aval-radio" style="transform: scale(1.3); cursor:pointer;">
                                <span style="font-size: 10px; font-weight: bold; color: #166534;">Realizou<br>(Total)</span>
                            </label>
                            <label style="flex: 1; background: #fffbeb; border: 1px solid #fde68a; padding: 8px 2px; border-radius: 6px; text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 5px; transition:0.2s;">
                                <input type="radio" name="crit_${item.id}" value="0.5" class="aval-radio" style="transform: scale(1.3); cursor:pointer;">
                                <span style="font-size: 10px; font-weight: bold; color: #b45309;">Parcial<br>(Metade)</span>
                            </label>
                            <label style="flex: 1; background: #fef2f2; border: 1px solid #fecaca; padding: 8px 2px; border-radius: 6px; text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 5px; transition:0.2s;">
                                <input type="radio" name="crit_${item.id}" value="0" class="aval-radio" style="transform: scale(1.3); cursor:pointer;">
                                <span style="font-size: 10px; font-weight: bold; color: #b91c1c;">Não Fez<br>(Zero)</span>
                            </label>
                            <label style="flex: 1; background: #f8fafc; border: 1px dashed #cbd5e1; padding: 8px 2px; border-radius: 6px; text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 5px; transition:0.2s;">
                                <input type="radio" name="crit_${item.id}" value="NO" class="aval-radio" style="transform: scale(1.3); cursor:pointer;">
                                <span style="font-size: 10px; font-weight: bold; color: #475569;">Não Obs.<br>(Ignorar)</span>
                            </label>
                        </div>
                    </div>
                `;
            });
            htmlCriterios += `</div>`;
        });

        root.innerHTML = `
            <div style="max-width: 600px; margin: 0 auto; padding: 15px; font-family: sans-serif; background: #f8fafc; min-height: 100vh;">
                <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); text-align: center; margin-bottom: 20px; border-top: 4px solid #16a34a;">
                    <h2 style="margin: 0 0 5px 0; color: #0f172a; font-size: 22px;">Avaliação Prática</h2>
                    <p style="margin: 0; color: #64748b; font-size: 14px;">Arbitragem de Bocha Paralímpica</p>
                </div>

                <div id="form-avaliacao">
                    <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); margin-bottom: 20px; border: 1px solid #e2e8f0;">
                        <label style="display: block; font-weight: 900; color: #0f172a; font-size: 14px; margin-bottom: 8px;">1. Seu Nome (Avaliador / Sombra) *</label>
                        <input type="text" id="aval-nome" placeholder="Digite seu nome completo" style="width: 100%; padding: 14px; border: 2px solid #cbd5e1; border-radius: 8px; font-size: 16px; box-sizing: border-box; margin-bottom: 20px; outline:none; transition:0.2s;" onfocus="this.style.borderColor='#3b82f6'">

                        <label style="display: block; font-weight: 900; color: #0f172a; font-size: 14px; margin-bottom: 8px;">2. Cursista a Avaliar *</label>
                        <select id="aval-cursista" style="width: 100%; padding: 14px; border: 2px solid #cbd5e1; border-radius: 8px; font-size: 16px; box-sizing: border-box; background: #f8fafc; outline:none; font-weight:bold; cursor:pointer;">
                            ${cursistasOptions}
                        </select>
                    </div>

                    <div id="area-criterios" style="display:none; opacity:0; transition: opacity 0.4s ease;">
                        <h3 style="text-align:center; color:#334155; margin-top:30px;">Critérios de Avaliação</h3>
                        ${htmlCriterios}

                        <div style="position: sticky; bottom: 0; background: white; padding: 15px 20px; border-top: 1px solid #e2e8f0; margin: 40px -15px -15px -15px; box-shadow: 0 -10px 20px rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center; z-index: 100;">
                            <div>
                                <div style="font-size: 11px; color: #64748b; font-weight: bold; text-transform: uppercase;">Nota Calculada</div>
                                <div id="aval-total" style="font-size: 32px; font-weight: 900; color: #16a34a; line-height:1;">0.0</div>
                            </div>
                            <button id="btn-enviar" style="background: #16a34a; color: white; border: none; padding: 15px 25px; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 6px rgba(22, 163, 74, 0.3); transition:0.2s;">
                                Enviar Avaliação
                            </button>
                        </div>
                    </div>
                </div>
                
                <div id="success-msg" style="display: none; background: #f0fdf4; border: 2px solid #22c55e; border-radius: 12px; padding: 40px 20px; text-align: center; margin-top: 40px; box-shadow:0 10px 25px rgba(34,197,94,0.1);">
                    <div style="font-size: 60px; margin-bottom: 15px;">✅</div>
                    <h2 style="color: #166534; margin: 0 0 10px 0; font-size:24px;">Avaliação Guardada!</h2>
                    <p style="color: #15803d; margin: 0; font-size: 15px; line-height:1.5;">A nota foi sincronizada na Base de Dados Oficial.</p>
                    
                    <button id="btn-nova-aval" style="margin-top: 30px; background: #16a34a; color: white; border: none; padding: 15px 25px; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; box-shadow:0 4px 10px rgba(0,0,0,0.1); width:100%;">
                        🔄 Avaliar Outro Cursista
                    </button>
                </div>
            </div>
        `;

        const selCursista = root.querySelector('#aval-cursista');
        const areaCriterios = root.querySelector('#area-criterios');
        const radios = root.querySelectorAll('.aval-radio');
        const labelTotal = root.querySelector('#aval-total');
        const btnEnviar = root.querySelector('#btn-enviar');
        const btnNova = root.querySelector('#btn-nova-aval');

        selCursista.addEventListener('change', () => {
            if (selCursista.value) {
                areaCriterios.style.display = 'block';
                setTimeout(() => areaCriterios.style.opacity = '1', 50);
            } else {
                areaCriterios.style.opacity = '0';
                setTimeout(() => areaCriterios.style.display = 'none', 300);
            }
        });

        radios.forEach(radio => {
            radio.addEventListener('change', () => {
                const notasObj = {};
                root.querySelectorAll('.aval-radio:checked').forEach(chk => {
                    notasObj[chk.name] = chk.value;
                });
                labelTotal.innerText = calcularTotalProporcional(notasObj).toFixed(1);
            });
        });

        btnNova.addEventListener('click', () => {
            selCursista.value = '';
            areaCriterios.style.opacity = '0';
            setTimeout(() => areaCriterios.style.display = 'none', 300);
            radios.forEach(r => r.checked = false);
            labelTotal.innerText = '0.0';
            
            root.querySelector('#success-msg').style.display = 'none';
            root.querySelector('#form-avaliacao').style.display = 'block';
            window.scrollTo(0, 0);
        });

        btnEnviar.addEventListener('click', async () => {
            const avaliador = root.querySelector('#aval-nome').value.trim();
            const cursistaId = selCursista.value;

            if (!avaliador) {
                alert("⚠️ Por favor, digite o SEU NOME no topo da página antes de enviar!");
                root.querySelector('#aval-nome').focus();
                return;
            }
            if (!cursistaId) {
                alert("⚠️ Selecione quem está a avaliar na caixa suspensa!");
                return;
            }

            const notasObj = {};
            root.querySelectorAll('.aval-radio:checked').forEach(chk => {
                notasObj[chk.name] = chk.value;
            });
            const totalCalculado = calcularTotalProporcional(notasObj);

            let ipDetectado = "Desconhecido";
            try {
                const ipRes = await fetch('https://api.ipify.org?format=json');
                const ipData = await ipRes.json();
                ipDetectado = ipData.ip;
            } catch(e) { console.warn("Não foi possível rastrear o IP."); }

            const payload = {
                avaliador: avaliador,
                data: new Date().toISOString(),
                notas: notasObj,
                total: totalCalculado,
                metadata: {
                    ip: ipDetectado,
                    device: getDeviceInfo(),
                    userAgent: navigator.userAgent
                }
            };

            btnEnviar.disabled = true;
            btnEnviar.innerText = "A Enviar...";

            try {
                const docRef = doc(db, "referees", cursistaId);
                const docSnapNow = await getDoc(docRef);
                
                if (!docSnapNow.exists()) throw new Error("O Cursista já não existe no sistema.");
                
                const dataNow = docSnapNow.data();
                const historicoNovo = [...(dataNow.avaliacoes_praticas || []), payload];

                await updateDoc(docRef, { avaliacoes_praticas: historicoNovo });
                
                root.querySelector('#form-avaliacao').style.display = 'none';
                root.querySelector('#success-msg').style.display = 'block';
                window.scrollTo(0, 0);

            } catch (err) {
                alert("Erro ao enviar avaliação: " + err.message);
            } finally {
                btnEnviar.disabled = false;
                btnEnviar.innerText = "Enviar Avaliação";
            }
        });

    } catch (error) {
        root.innerHTML = `
            <div style="padding: 40px 20px; text-align: center; font-family: sans-serif;">
                <h2 style="color: #ef4444;">❌ Erro de Ligação</h2>
                <p style="color: #64748b;">Não foi possível aceder à base de dados. Tente novamente mais tarde.</p>
            </div>
        `;
    }
}