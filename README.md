🔵🔴 SCBP - Sistema de Competição de Bocha Paralímpica

Uma plataforma web completa (Single Page Application) desenvolvida para gerir, de ponta a ponta, competições de Bocha Paralímpica. O sistema automatiza a criação de chaves, agendamento de partidas, gestão de árbitros e registo de resultados em tempo real.

## ✨ Principais Funcionalidades

* **Gestão de Cadastros:** Administração de Clubes, Classes (BC1, BC2, etc.), Atletas, Equipas e Oficiais.
* **Motor de Sorteio e Chaves:** Geração automática de fases de grupos e eliminatórias baseada em "Seeds" (Cabeças de Chave) e cruzamentos dinâmicos.
* **Agenda Inteligente e Manual:**
    * **Drag & Drop:** Construtor visual de grelha de jogos por quadra e horário.
    * **Gerador IA:** Algoritmo automático de densidade e distribuição inteligente respeitando limites de descanso e volume de jogos por atleta.
* **Gestão de Arbitragem:** Escala de árbitros (Árbitro Principal, Avaliador, Linha, Mesa) integrada diretamente na grelha, com deteção de conflitos de horário.
* **Geração de Documentos (PDF/Print):** Emissão automática de Start Lists, Escalas de Arbitragem e Logbook Oficial (National Log Book Sheet) assinável.
* **Súmula e Placar Eletrónico:** Interface ao vivo para pontuação de parciais e controlo de tempo (Call Room e Live Scoreboard).
* **Módulo de Dispensas:** Fluxo completo para atletas solicitarem dispensas oficiais e administração aprovar/rejeitar e gerar ofícios.
* **Controle de Acessos (RBAC):** Níveis de permissão rigorosos (Admin Total, Admin Nível 1/2, Utilizador, Público).
* **Auditoria (Logs):** Registo em tempo real (IP, Data, Utilizador) de ações sensíveis no sistema.

## 🛠️ Tecnologias Utilizadas

* **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+ Modules) - *Sem frameworks pesados para máxima performance.*
* **Backend / Database:** Firebase Authentication & Firebase Cloud Firestore (NoSQL).
* **Geração de PDFs:** jsPDF.

## 🚀 Como Rodar o Sistema Localmente (Instalação Manual)

Como o sistema é uma *Single Page Application* (SPA) que consome o Firebase diretamente do lado do cliente, não precisa de instalar o Node.js ou compilar nada com Webpack/Vite.

### Pré-requisitos
* Uma conta no [Firebase](https://firebase.google.com/).
* Um servidor web local simples (ex: extensão "Live Server" no VS Code ou Python).

### Passo a Passo

**1. Clonar o repositório**
\`\`\`bash
git clone https://github.com/SEU_USUARIO/scbp.git
cd scbp
\`\`\`

**2. Configurar o Firebase**
Crie ou edite o ficheiro \`client/js/firebase-config.js\` e insira as credenciais do seu projeto Firebase:
\`\`\`javascript
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_MESSAGING_ID",
  appId: "SEU_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
\`\`\`

**3. Iniciar o Servidor Local**
Sirva a pasta \`client\` no seu navegador. Se usar o VS Code, basta clicar no botão **"Go Live"** da extensão Live Server.

Se preferir usar o terminal via Python (que sei que você domina), rode o seguinte comando dentro da pasta \`client\`:
\`\`\`bash
# Python 3
python -m http.server 8000
\`\`\`
Depois, abra no seu navegador: \`http://localhost:8000\`

---
*Desenvolvido por Gabriel Sousa.* 

# 🔵🔴 SCBP - Paralympic Boccia Competition System

A comprehensive web platform (Single Page Application) developed to manage Paralympic Boccia competitions from end to end. The system automates bracket creation, match scheduling, referee management, and real-time score tracking.

## ✨ Key Features

* **Registration Management:** Administration of Clubs, Classes (BC1, BC2, etc.), Athletes, Teams, and Officials.
* **Draw & Bracket Engine:** Automatic generation of pool phases and knockout stages based on "Seeds" and dynamic matchups.
* **Smart & Manual Scheduling:**
    * **Drag & Drop:** Visual grid builder for assigning matches to courts and time slots.
    * **AI Generator:** Automatic algorithm for density and intelligent distribution, respecting minimum rest times and maximum games per athlete.
* **Referee Management:** Referee assignments (Main, Shadow, Line, Time/Score) integrated directly into the schedule, with automatic time conflict detection.
* **Document Generation (PDF/Print):** Automated creation of Start Lists, Referee Schedules, and signable Official Logbooks (National Log Book Sheet).
* **Scoresheet & Live Scoreboard:** Live interface for partial scoring and time control (Call Room and Live Scoreboard).
* **Exemption Module (Dispensas):** Complete workflow for athletes to request official exemptions, and for administrators to approve/reject and generate official PDF letters.
* **Access Control (RBAC):** Strict permission levels (Global Admin, Level 1/2 Admin, User, Public).
* **Audit Logs:** Real-time tracking (IP, Date, User) of sensitive actions within the system.

## 🛠️ Tech Stack

* **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+ Modules) - *No heavy frameworks for maximum performance.*
* **Backend / Database:** Firebase Authentication & Firebase Cloud Firestore (NoSQL).
* **PDF Generation:** jsPDF.

## 🚀 How to Run Locally (Manual Installation)

Since this system is a *Single Page Application* (SPA) that communicates with Firebase directly from the client side, you don't need to install Node.js or compile anything with Webpack/Vite.

### Prerequisites
* A [Firebase](https://firebase.google.com/) account.
* A simple local web server (e.g., the "Live Server" extension in VS Code or Python).

### Step-by-Step

**1. Clone the repository**
\`\`\`bash
git clone https://github.com/YOUR_USERNAME/scbp.git
cd scbp
\`\`\`

**2. Configure Firebase**
Create or edit the \`client/js/firebase-config.js\` file and insert your Firebase project credentials:
\`\`\`javascript
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
\`\`\`

**3. Start the Local Server**
Serve the \`client\` folder in your browser. If you use VS Code, simply click the **"Go Live"** button from the Live Server extension.

If you prefer using the terminal via Python, run the following command inside the \`client\` folder:
\`\`\`bash
# Python 3
python -m http.server 8000
\`\`\`
Then, open in your browser: \`http://localhost:8000\`

---
*Developed by Gabriel Sousa.*
--- 
*Última atualização: 18/03/2026 às 13:33* 
 
> - **Atualizado: 18/03/2026 as 18:02** 
>   - Nome do Sistema  
 
> - **Atualizado: 19/03/2026 as 17:50** 
>   - Alteração de simulador de competição, dashboard inserida log, pagina de devolução de bolas 
