# bochabr-app
# 🎯 Sistema de Gestão de Bocha Paralímpica (Real-Time SPA)

## 📌 Visão Geral
Uma Single Page Application (SPA) desenvolvida para o gerenciamento de alto desempenho e arbitragem de competições de Bocha Paralímpica. O sistema resolve o problema crítico de latência e sincronização em eventos esportivos, garantindo comunicação em tempo real entre o painel do árbitro (tablet/mobile) e o placar de exibição (TV/Telão).

## 🚀 Arquitetura e Soluções Técnicas
Este projeto foi construído sob uma arquitetura *Client-Side Heavy*, priorizando o processamento descentralizado no navegador do usuário para garantir tolerância a falhas de rede e resposta instantânea.

* **Sincronização Zero-Latency:** Utilização da API nativa `BroadcastChannel` para comunicação local entre abas/janelas, eliminando a necessidade de *round-trips* ao servidor durante a contagem de cronômetros.
* **Gerenciamento de Estado Customizado:** Implementação de uma estrutura de dados em **Pilha (Stack)**, realizando *Deep Copies* do estado da partida a cada interação. Isso viabiliza um recurso de "Desfazer (Undo)" instantâneo, vital para corrigir erros humanos da arbitragem em frações de segundo.
* **Escrita Otimizada em Nuvem:** Persistência de dados assíncrona orientada a eventos. O sistema consolida os metadados (torneios, chaves, pontuações parciais) e apenas realiza chamadas de escrita (`updateDoc`) no encerramento de ciclos críticos, reduzindo drasticamente o custo e a carga no servidor.
* **Síntese de Áudio via Hardware:** Substituição de arquivos estáticos pesados por geração de frequências sonoras puras via `Web Audio API` (`AudioContext`), garantindo disparos de bipes de cronômetro precisos e imunes a gargalos de download.

## 🛠️ Stack Tecnológico
* **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3 Avançado (Flexbox, Viewport Units, Injeção Dinâmica).
* **Backend as a Service (BaaS):** Firebase Cloud Firestore (NoSQL).
* **Segurança e Identidade:** Firebase Authentication.
* **Aceleração de Desenvolvimento:** Práticas de *AI-Assisted Development* aplicadas à refatoração de código e estruturação lógica.

## ⚙️ Como Executar Localmente
1. Clone este repositório: `git clone https://github.com/gabrielrdesousa123/bochabr-app.git`
2. Instale as dependências do ecossistema Node.js executando: `npm install`
3. Solicite a chave privada (`firebase-key.json`) ao administrador do repositório para acesso ao banco de dados, e insira-a na raiz do projeto.
4. Inicie o servidor de desenvolvimento: `npm start` (ou o script configurado no seu package.json).
