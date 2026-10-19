import {
  agir, novoJogo, restante, acertos, tempoDaRodada, vencedor, formatarValor, premioGarantido, emContagem,
  papel, podeAgir, NIVEIS, NIVEL_GARANTIDO, ACERTOS_BONUS, TENTATIVAS_BONUS, RODADAS_INICIAIS, CONFIG_PADRAO,
} from "./jogo.js";
import { BANCO } from "./palavras.js";

const CHAVE_PARTIDA = "palavraChave.partida";
const CHAVE_USADAS = "palavraChave.usadas";
const CHAVE_CONFIG = "palavraChave.ultimaConfig";
const CHAVE_NOME = "palavraChave.meuNome";
const CHAVE_SALA = "palavraChave.sala";
const CHAVE_SOM = "palavraChave.somSala";
const CONTAGEM_MS = 3000;
const QR_SCRIPT = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";

const app = document.getElementById("app");
const dialogo = document.getElementById("dialogo");

let estado = ler(CHAVE_PARTIDA);   // partida em andamento (no modo sala, vem do banco)
let ui = { tela: "inicio", contagem: null, config: null, erro: null, ocupado: false };

// Modo "cada um no seu celular": null quando se joga com um celular só.
let sala = null;   // { codigo, dados, souAnfitriao, uid, pararOuvir, pararPedidos }
let S = null;      // módulo sala.js, carregado sob demanda
let estadoHost = null;

// ---------- armazenamento (falhas viram "sem dados") ----------

function ler(chave) {
  try { return JSON.parse(localStorage.getItem(chave)); } catch { return null; }
}
function gravar(chave, valor) {
  try {
    if (valor == null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, JSON.stringify(valor));
  } catch { /* sem armazenamento: o jogo segue só na memória */ }
}

// ---------- sorteio sem repetir entre partidas ----------

function embaralhar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sortear(dificuldades, quantidade) {
  const usadas = new Set(ler(CHAVE_USADAS) || []);
  const universo = dificuldades.flatMap(d => BANCO[d] || []);
  let livres = universo.filter(p => !usadas.has(p));
  if (livres.length < quantidade) {
    // acabaram as inéditas deste nível: libera o nível de novo
    universo.forEach(p => usadas.delete(p));
    livres = universo.filter(p => !usadas.has(p));
  }
  const escolhidas = embaralhar(livres).slice(0, quantidade);
  escolhidas.forEach(p => usadas.add(p));
  gravar(CHAVE_USADAS, [...usadas]);
  return escolhidas;
}

function agoraAtual() { return sala ? S.agora() : Date.now(); }
function ctx() { return { agora: agoraAtual(), aleatorio: Math.random, sortear }; }

// ---------- papéis no modo sala ----------

function posicaoDe(e, uid) {
  if (!e?.uids) return null;
  for (let eq = 0; eq < 2; eq++) {
    for (let j = 0; j < 2; j++) if (e.uids[eq]?.[j] === uid) return { equipe: eq, jogador: j };
  }
  return null;
}
function minhaPos() { return sala ? posicaoDe(estado, sala.uid) : null; }
function meuPapel() { return sala ? papel(estado, minhaPos()) : "local"; }
function pode(tipo) { return !sala || podeAgir(estado, tipo, minhaPos()); }

// ---------- despacho ----------

function despachar(tipo, dados = {}) {
  if (sala) {
    if (!estado) return;
    if (sala.souAnfitriao) processarPedido({ uid: sala.uid, tipo, dados, seq: estado.seq });
    else S.enviarPedido(sala.codigo, tipo, dados, estado.seq).catch(() => avisar("Sem conexão", "Não consegui enviar. Confira a internet."));
    return;
  }
  const antes = estado;
  estado = agir(estado, tipo, dados, ctx());
  if (estado === antes) return;
  gravar(CHAVE_PARTIDA, estado);
  efeitos(antes, estado, tipo);
  render();
}

// Só no celular do anfitrião: confere se quem pediu pode, aplica a regra e grava para todos.
async function processarPedido({ uid, tipo, dados = {}, seq }) {
  const atual = estadoHost;
  if (!atual || !sala) return;
  // um toque feito em cima de uma tela que já mudou não vale (evita toque duplo e atropelos)
  if (seq !== atual.seq && tipo !== "pausar" && tipo !== "tempoEsgotado") return;
  if (!podeAgir(atual, tipo, posicaoDe(atual, uid))) return;
  const d = tipo === "comecar" ? { ...dados, atraso: CONTAGEM_MS } : dados;
  const novo = agir(atual, tipo, d, ctx());
  if (novo === atual) return;
  novo.seq = (atual.seq || 0) + 1;
  novo.uids = atual.uids;
  estadoHost = novo;
  await S.gravarEstado(sala.codigo, novo);
}

// Descobre, comparando dois estados, o que aconteceu (para tocar o som certo nos outros celulares).
function inferirTipo(antes, depois) {
  const a = antes?.rodada, d = depois?.rodada;
  if (!a || !d || a.equipe !== d.equipe || a.numero !== d.numero || a.fase !== d.fase) return null;
  for (let i = 0; i < d.palavras.length; i++) {
    const pa = a.palavras[i], pd = d.palavras[i];
    if (!pa || !pd) continue;
    if (pa.status !== pd.status) {
      if (pd.status === "acerto") return "acertou";
      if (pd.status === "anulada") return "anular";
      if (pd.status === "perdida" && pd.tentativas > pa.tentativas) return "errou";
      if (pd.status === "passada" || pd.status === "perdida") return "passar";
    }
    if (pd.tentativas > pa.tentativas && pd.status === "pendente") return "errou";
  }
  return null;
}

function efeitos(antes, depois, tipo) {
  if (!antes || !depois) return;
  if (tipo === "acertou") { som.acerto(); vibrar(40); }
  if (tipo === "errou") { som.erro(); vibrar(80); }
  if (tipo === "passar") som.passar();
  if (tipo === "anular") { som.erro(); vibrar([60, 40, 60]); }
  if (!sala) {
    if (depois.tela === "jogando" && antes.tela !== "jogando") manterTelaLigada(true);
    if (antes.tela === "jogando" && depois.tela !== "jogando") manterTelaLigada(false);
  }
  if (antes.tela === "jogando" && depois.tela !== "jogando") {
    const motivo = depois.rodada?.motivo;
    if (motivo === "tempo") { som.fim(); vibrar([200, 80, 200]); }
    else if (motivo === "meta" || motivo === "todas") som.vitoria();
    else som.fim();
  }
  if (depois.tela === "resultadoBonus" && antes.tela !== "resultadoBonus") {
    const eq = depois.equipes[depois.ordemBonus[depois.indiceBonus]];
    if (eq.bonus.premio > 0) som.vitoria();
  }
  if (depois.tela === "fim" && antes.tela !== "fim") som.vitoria();
}

// ---------- som, vibração e tela ligada ----------

function somLigado() {
  if (sala) return ler(CHAVE_SOM) ?? true;
  return estado?.config?.som ?? ler(CHAVE_CONFIG)?.config?.som ?? true;
}

let audio = null;
function tom(freq, dur, tipo = "sine", vol = 0.18, atraso = 0) {
  if (!somLigado()) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const t = audio.currentTime + atraso;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { /* sem áudio */ }
}
const som = {
  tique: () => tom(1200, 0.07, "square", 0.08),
  contagem: () => tom(660, 0.15, "triangle", 0.2),
  vai: () => tom(990, 0.3, "triangle", 0.22),
  acerto: () => { tom(880, 0.12, "triangle", 0.2); tom(1320, 0.2, "triangle", 0.2, 0.09); },
  erro: () => tom(160, 0.3, "square", 0.12),
  passar: () => tom(520, 0.12, "sine", 0.15),
  fim: () => { tom(392, 0.25, "sawtooth", 0.12); tom(262, 0.5, "sawtooth", 0.12, 0.22); },
  vitoria: () => [523, 659, 784, 1047].forEach((f, i) => tom(f, 0.22, "triangle", 0.2, i * 0.12)),
};
function vibrar(padrao) {
  try { navigator.vibrate?.(padrao); } catch { /* sem vibração */ }
}
let travaTela = null;
let querTelaLigada = false;
async function manterTelaLigada(ligar) {
  querTelaLigada = ligar;
  try {
    if (ligar && !travaTela && navigator.wakeLock) travaTela = await navigator.wakeLock.request("screen");
    if (!ligar && travaTela) { await travaTela.release(); travaTela = null; }
  } catch { travaTela = null; }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && querTelaLigada) { travaTela = null; manterTelaLigada(true); }
});

// ---------- utilidades de interface ----------

function esc(t) {
  return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function nomeEquipe(i) { return esc(estado.equipes[i].nome); }
function jogador(eq, j) { return esc(estado.equipes[eq].jogadores[j]); }
function seloEquipe(i, nome = nomeEquipe(i)) {
  return `<span class="selo equipe equipe-${i}"><span class="ponto-cor"></span>${nome}</span>`;
}
function mmss(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function topo(menu = true) {
  return `<header class="topo">
    <img src="icons/icone-192.png" alt="">
    <div class="marca-mini">Palavra<span>-</span>Chave${sala ? ` <span class="selo" style="margin-left:6px">Sala ${esc(sala.codigo)}</span>` : ""}</div>
    ${menu ? `<button class="btn-icone" data-acao="menu" aria-label="Menu">☰</button>` : ""}
  </header>${faixaConexao()}`;
}
function faixaConexao() {
  if (!sala || !S) return "";
  if (!S.online()) return `<p class="faixa">Sem internet. Tentando reconectar…</p>`;
  const dados = sala.dados;
  const host = dados?.jogadores?.[dados.anfitriao];
  if (!sala.souAnfitriao && host && host.online === false) {
    return `<p class="faixa">O celular de <b>${esc(host.nome)}</b> (quem criou a sala) está desconectado. O jogo continua quando ele voltar.</p>`;
  }
  return "";
}
function espera(texto) {
  return `<p class="esperando"><span class="pontinhos"><i></i><i></i><i></i></span>${texto}</p>`;
}
function tamanhoSenha(texto) {
  const n = texto.length;
  if (n <= 6) return "3.6rem";
  if (n <= 9) return "3rem";
  if (n <= 12) return "2.4rem";
  if (n <= 16) return "1.9rem";
  return "1.5rem";
}
const ROTULO_STATUS = {
  acerto: "✓ Acertou", anulada: "✗ Anulada", passada: "↷ Passada", pendente: "— Não saiu", perdida: "✗ Perdida",
};

// ---------- telas fora da partida ----------

function telaInicio() {
  const temPartida = estado && estado.tela !== "fim";
  return `<main class="inicio">
    <img class="logo-grande" src="icons/icone-512.png" alt="Logo do Palavra-Chave: uma chave dourada com um balão de fala">
    <h1 class="marca">Palavra<span>-</span>Chave</h1>
    <p class="slogan">Uma palavra de cada vez.</p>
    <div class="pilha">
      ${temPartida ? `<button class="btn" data-acao="continuar">▶ Continuar partida</button>` : ""}
      <button class="btn ${temPartida ? "sec" : ""}" data-acao="novo">📱 Um celular só</button>
      <button class="btn sec" data-acao="abrirSala">👨‍👩‍👧‍👦 Cada um no seu celular</button>
      <button class="btn texto" data-acao="regras">Como jogar</button>
    </div>
  </main>`;
}

function configInicial() {
  const salvo = ler(CHAVE_CONFIG);
  return salvo || {
    equipes: [
      { nome: "Equipe Azul", jogadores: ["", ""] },
      { nome: "Equipe Laranja", jogadores: ["", ""] },
    ],
    config: { ...CONFIG_PADRAO },
  };
}

function segmentos(acao, campo, valores, atual) {
  return `<div class="segmentos">${valores.map(v =>
    `<button type="button" data-acao="${acao}" data-campo="${campo}" data-valor="${v}" aria-pressed="${atual === v}">${v}s</button>`).join("")}</div>`;
}

function telaConfig() {
  const c = ui.config;
  const equipe = i => `<section class="cartao equipe-form equipe-${i} pilha">
      <h3>Equipe ${i + 1}</h3>
      <div class="campo"><label for="e${i}">Nome da equipe</label>
        <input type="text" id="e${i}" data-eq="${i}" data-campo="nome" value="${esc(c.equipes[i].nome)}" maxlength="24" autocomplete="off"></div>
      <div class="linha">
        <div class="campo"><label for="e${i}j0">Jogador 1</label>
          <input type="text" id="e${i}j0" data-eq="${i}" data-j="0" value="${esc(c.equipes[i].jogadores[0])}" maxlength="16" placeholder="Nome" autocomplete="off"></div>
        <div class="campo"><label for="e${i}j1">Jogador 2</label>
          <input type="text" id="e${i}j1" data-eq="${i}" data-j="1" value="${esc(c.equipes[i].jogadores[1])}" maxlength="16" placeholder="Nome" autocomplete="off"></div>
      </div>
    </section>`;
  return `${topo(false)}
  <main class="pilha">
    <h2 class="titulo-tela">Novo jogo</h2>
    <p class="mudo">Duas equipes de duas pessoas. Um celular só, passando de mão em mão.</p>
    ${equipe(0)}
    ${equipe(1)}
    <section class="cartao pilha">
      <div class="campo"><label>Tempo das rodadas iniciais</label>${segmentos("cfg", "tempoInicial", [30, 45, 60], c.config.tempoInicial)}</div>
      <div class="campo"><label>Tempo de cada nível do bônus</label>${segmentos("cfg", "tempoBonus", [90, 120, 150], c.config.tempoBonus)}</div>
      <label class="alternar">Modo infantil (só palavras fáceis)
        <input type="checkbox" data-acao="cfgCheck" data-campo="infantil" ${c.config.infantil ? "checked" : ""}></label>
      <label class="alternar">Sons
        <input type="checkbox" data-acao="cfgCheck" data-campo="som" ${c.config.som ? "checked" : ""}></label>
    </section>
    <button class="btn gigante" data-acao="iniciar">Sortear quem começa e jogar</button>
    <button class="btn texto" data-acao="voltarInicio">Voltar</button>
  </main>`;
}

function telaRegras() {
  return `${topo(false)}
  <main class="regras">
    <h2 class="titulo-tela">Como jogar</h2>
    <p class="mudo">Duas equipes de duas pessoas. Em cada equipe, uma pessoa dá dicas e a outra adivinha a <b>senha</b>.
    A equipe adversária fiscaliza as regras e confere os pontos.</p>

    <h3>1. Rodadas iniciais</h3>
    <ul>
      <li><b>4 rodadas por equipe</b>, alternando entre as equipes.</li>
      <li>Cada rodada tem <b>5 senhas</b> e <b>30 segundos</b>. Cada acerto vale <b>1 ponto</b>.</li>
      <li>Pode <b>passar</b> a qualquer momento. Se sobrar tempo depois da 5ª senha, as passadas voltam.</li>
      <li>A cada rodada <b>inverte</b> quem dá a dica e quem adivinha.</li>
      <li>Quem fizer mais pontos joga o bônus primeiro.</li>
    </ul>

    <h3>2. Rodadas de bônus</h3>
    <ul>
      <li>A equipe escolhe quem dá as dicas, e é a mesma pessoa até o fim.</li>
      <li>Cada nível tem <b>90 segundos</b> e é preciso <b>acertar 5 senhas</b>.</li>
      <li>No máximo <b>3 dicas por senha</b>. Errou 3 vezes ou passou, a senha está perdida.</li>
      <li>Antes de cada nível, a equipe decide se <b>continua ou para</b> com o prêmio. Depois de sortear, não dá para desistir.</li>
      <li>Ao completar o nível de <b>R$ 25 mil</b>, esse valor fica <b>garantido</b>.</li>
      <li>Depois a outra equipe joga. Vence quem levar o maior prêmio (empate: mais pontos nas rodadas iniciais).</li>
    </ul>
    <table class="tabela-niveis">
      ${NIVEIS.map((n, i) => `<tr><td>${formatarValor(n.valor)}${i === NIVEL_GARANTIDO - 1 ? " 🔒" : ""}</td><td>5 de ${n.palavras} senhas</td></tr>`).join("")}
    </table>

    <h3>Regras das dicas</h3>
    <ul>
      <li>Só <b>uma palavra</b> por dica. Palavra composta não vale (para <i>segurança</i>, "guarda-costas" não pode, "vigia" pode).</li>
      <li><b>Nomes próprios valem</b> ("Stallone" para <i>ação</i>).</li>
      <li>Não pode usar <b>parte da senha</b> ("bacalhau" para <i>bacalhoada</i>).</li>
      <li>Não pode dizer a <b>letra inicial</b>.</li>
      <li>Nada de <b>gestos, mímica, caretas ou silêncio</b> como dica.</li>
      <li>Pode <b>repetir dicas</b>.</li>
      <li>Dica proibida: a equipe adversária manda <b>anular</b> e a senha não conta, mesmo que tenha sido acertada.</li>
    </ul>

    <h3>Cada um no seu celular</h3>
    <ul>
      <li>Uma pessoa <b>cria a sala</b> e manda o convite (link ou QR Code). Os outros entram e escolhem a equipe.</li>
      <li>Só quem dá as dicas vê a senha e os botões de acerto. Quem adivinha vê só o tempo. A equipe adversária vê a senha e o botão de anular.</li>
      <li>O celular de quem criou a sala comanda a partida, então ele precisa ficar com o jogo aberto e com internet.</li>
    </ul>
    <div class="pilha" style="margin-top:22px">
      <button class="btn" data-acao="voltarInicio">Entendi</button>
    </div>
  </main>`;
}

// ---------- entrada no modo sala ----------

function codigoDaUrl() {
  try { return new URLSearchParams(location.search).get("sala") || ""; } catch { return ""; }
}

function telaEntradaSala() {
  const nome = ler(CHAVE_NOME) || "";
  const codigo = ui.codigoConvite || "";
  const blocoEntrar = `<section class="cartao pilha">
      <h3 class="subtitulo">Entrar numa sala</h3>
      <div class="campo"><label for="codigoSala">Código da sala</label>
        <input type="text" id="codigoSala" class="codigo-input" value="${esc(codigo)}" maxlength="4" placeholder="ABCD" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
      <button class="btn ${codigo ? "gigante" : "sec"}" data-acao="entrarSala" ${ui.ocupado ? "disabled" : ""}>Entrar na sala</button>
    </section>`;
  const blocoCriar = `<section class="cartao pilha">
      <h3 class="subtitulo">Criar uma sala nova</h3>
      <p class="fraco">Você recebe um código e um convite para mandar no WhatsApp.</p>
      <button class="btn ${codigo ? "sec" : "gigante"}" data-acao="criarSala" ${ui.ocupado ? "disabled" : ""}>Criar sala</button>
    </section>`;
  return `${topo(false)}
  <main class="pilha">
    <h2 class="titulo-tela">Cada um no seu celular</h2>
    <p class="mudo">Todos no mesmo lugar, cada um com o seu celular e com internet. As dicas continuam sendo faladas.</p>
    <div class="campo"><label for="meuNome">Seu nome</label>
      <input type="text" id="meuNome" value="${esc(nome)}" maxlength="16" placeholder="Como vão te chamar no jogo" autocomplete="off"></div>
    ${ui.erro ? `<p class="erro">${esc(ui.erro)}</p>` : ""}
    ${ui.ocupado ? espera("Conectando…") : ""}
    ${codigo ? blocoEntrar + blocoCriar : blocoCriar + blocoEntrar}
    <button class="btn texto" data-acao="voltarInicio">Voltar</button>
  </main>`;
}

function linkConvite() {
  return `${location.origin}${location.pathname}?sala=${sala.codigo}`;
}

function membros(dados) {
  const lista = Object.entries(dados.jogadores || {}).map(([uid, j]) => ({ uid, ...j }));
  lista.sort((a, b) => (a.em || 0) - (b.em || 0));
  return {
    equipes: [0, 1].map(eq => lista.filter(j => j.equipe === eq)),
    plateia: lista.filter(j => j.equipe === -1),
    semEquipe: lista.filter(j => j.equipe == null),
  };
}

function telaLobby() {
  const d = sala.dados;
  const host = sala.souAnfitriao;
  const m = membros(d);
  const eu = d.jogadores?.[sala.uid];
  const pessoa = j => `<li class="pessoa ${j.online === false ? "fora" : ""}">
      <span class="status-online"></span>
      <span class="nome-pessoa">${esc(j.nome)}${j.uid === sala.uid ? " <i>(você)</i>" : ""}${j.uid === d.anfitriao ? " 👑" : ""}</span>
      ${host && j.uid !== sala.uid ? `<button class="mini" data-acao="tirarDaEquipe" data-uid="${j.uid}" aria-label="Tirar ${esc(j.nome)} da equipe">✕</button>` : ""}
    </li>`;
  const equipe = i => {
    const lista = m.equipes[i];
    const nome = d.lobby.equipes[i].nome;
    const estou = eu?.equipe === i;
    return `<section class="cartao equipe-form equipe-${i} pilha">
      ${host ? `<input type="text" class="nome-equipe-input" data-equipe-nome="${i}" value="${esc(nome)}" maxlength="24" aria-label="Nome da equipe ${i + 1}">`
        : `<h3>${esc(nome)}</h3>`}
      <ul class="pessoas">${lista.map(pessoa).join("") || `<li class="fraco">Ninguém ainda</li>`}</ul>
      <p class="fraco">${lista.length}/2 jogadores</p>
      ${estou ? "" : lista.length < 2 ? `<button class="btn pequeno" data-acao="escolherEquipe" data-equipe="${i}">Entrar na ${esc(nome)}</button>` : ""}
    </section>`;
  };
  const prontos = m.equipes[0].length === 2 && m.equipes[1].length === 2;
  const cfg = d.lobby.config;
  const extras = [...m.plateia, ...m.semEquipe];
  return `${topo()}
  <main class="pilha">
    <section class="cartao centro pilha convite">
      <p class="fraco">Código da sala</p>
      <p class="codigo-grande">${esc(sala.codigo)}</p>
      <div id="qr" class="qr" aria-label="QR Code para entrar na sala"></div>
      <button class="btn" data-acao="compartilhar">📤 Mandar convite</button>
    </section>
    ${eu?.equipe == null ? `<p class="aviso">Escolha a sua equipe abaixo.</p>` : ""}
    ${equipe(0)}
    ${equipe(1)}
    <section class="cartao pilha">
      <h3 class="subtitulo">Assistindo / sem equipe</h3>
      <ul class="pessoas">${extras.map(pessoa).join("") || `<li class="fraco">Ninguém</li>`}</ul>
      ${eu?.equipe === -1 ? "" : `<button class="btn sec pequeno" data-acao="escolherEquipe" data-equipe="-1">Só assistir</button>`}
    </section>
    ${host ? `<section class="cartao pilha">
      <div class="campo"><label>Tempo das rodadas iniciais</label>${segmentos("salaCfg", "tempoInicial", [30, 45, 60], cfg.tempoInicial)}</div>
      <div class="campo"><label>Tempo de cada nível do bônus</label>${segmentos("salaCfg", "tempoBonus", [90, 120, 150], cfg.tempoBonus)}</div>
      <label class="alternar">Modo infantil (só palavras fáceis)
        <input type="checkbox" data-acao="salaCfgCheck" data-campo="infantil" ${cfg.infantil ? "checked" : ""}></label>
    </section>
    <button class="btn gigante" data-acao="comecarSala" ${prontos ? "" : "disabled"}>Começar partida</button>
    ${prontos ? "" : `<p class="fraco centro">Cada equipe precisa de 2 pessoas para começar.</p>`}`
    : espera("Aguardando quem criou a sala começar a partida…")}
    <button class="btn texto" data-acao="sairSala">Sair da sala</button>
  </main>`;
}

let qrCarregando = null;
function carregarQR() {
  if (window.qrcode) return Promise.resolve();
  qrCarregando ||= new Promise((ok, erro) => {
    const s = document.createElement("script");
    s.src = QR_SCRIPT;
    s.onload = ok;
    s.onerror = erro;
    document.head.appendChild(s);
  });
  return qrCarregando;
}
function preencherQR() {
  const alvo = document.getElementById("qr");
  if (!alvo || !sala) return;
  carregarQR().then(() => {
    const el = document.getElementById("qr");
    if (!el) return;
    const q = window.qrcode(0, "M");
    q.addData(linkConvite());
    q.make();
    el.innerHTML = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  }).catch(() => { alvo.remove(); });
}

// ---------- telas da partida ----------

function telaPasse() {
  const r = estado.rodada;
  const adversaria = 1 - r.equipe;
  const bonus = r.fase === "bonus";
  const fase = bonus
    ? `<span class="selo ouro">Bônus · ${formatarValor(NIVEIS[r.nivel].valor)}</span>`
    : `<span class="selo">Rodada ${r.numero} de ${RODADAS_INICIAIS}</span>`;
  const resumo = bonus
    ? `Acertar <b>${ACERTOS_BONUS} de ${r.palavras.length}</b> senhas · <b>${estado.config.tempoBonus} s</b> · até <b>${TENTATIVAS_BONUS} dicas</b> por senha`
    : `<b>${r.palavras.length} senhas</b> · <b>${estado.config.tempoInicial} s</b> · pode passar`;
  const aviso = bonus ? `<p class="aviso">As senhas deste nível já foram sorteadas: agora não dá mais para desistir.</p>` : "";
  const papeis = `<div class="papeis">
      <div class="cartao"><span class="fraco">Adivinha</span><b>${jogador(r.equipe, r.adivinhador)}</b></div>
      <div class="cartao equipe-${adversaria}"><span class="fraco">Fiscaliza</span><b style="color:var(--cor)">${nomeEquipe(adversaria)}</b></div>
    </div>`;

  if (!sala) {
    return `${topo()}
    <main class="passe">
      <div class="selos">${seloEquipe(r.equipe)} ${fase}</div>
      <p class="mudo">Entregue o celular para</p>
      <p class="nome-grande">${jogador(r.equipe, r.doador)}</p>
      <p class="mudo">que vai dar as dicas. Não mostre a tela para quem adivinha!</p>
      ${papeis}
      <p class="mudo">${resumo}</p>
      ${aviso}
      <div class="espaco"></div>
      <button class="btn gigante" data-acao="contagem">Estou pronto!</button>
    </main>`;
  }

  const p = meuPapel();
  const titulo = {
    doador: `<p class="mudo">É a sua vez!</p><p class="nome-grande">Você dá as dicas</p><p class="mudo">para <b>${jogador(r.equipe, r.adivinhador)}</b>. Só o seu celular mostra a senha.</p>`,
    adivinhador: `<p class="mudo">É a sua vez!</p><p class="nome-grande">Você adivinha</p><p class="mudo">Preste atenção nas dicas de <b>${jogador(r.equipe, r.doador)}</b>.</p>`,
    fiscal: `<p class="mudo"><b>${jogador(r.equipe, r.doador)}</b> dá as dicas para <b>${jogador(r.equipe, r.adivinhador)}</b>.</p><p class="nome-grande">Vocês fiscalizam</p><p class="mudo">Vocês vão ver a senha. Fiquem de olho nas dicas proibidas!</p>`,
    plateia: `<p class="mudo"><b>${jogador(r.equipe, r.doador)}</b> dá as dicas para <b>${jogador(r.equipe, r.adivinhador)}</b>.</p><p class="nome-grande">Você assiste</p>`,
  }[p];
  return `${topo()}
  <main class="passe">
    <div class="selos">${seloEquipe(r.equipe)} ${fase}</div>
    ${titulo}
    ${p === "fiscal" || p === "plateia" ? papeis : ""}
    <p class="mudo">${resumo}</p>
    ${p === "doador" ? aviso : ""}
    <div class="espaco"></div>
    ${p === "doador"
      ? `<button class="btn gigante" data-acao="comecarRodada">Estou pronto!</button>`
      : espera(`Aguardando ${jogador(r.equipe, r.doador)} ficar pronto…`)}
  </main>`;
}

function telaJogando() {
  const r = estado.rodada;
  const p = r.palavras[r.atual];
  const bonus = r.fase === "bonus";
  const ms = restante(estado, agoraAtual());
  const total = tempoDaRodada(estado);
  const alerta = ms <= 5000;
  const meu = meuPapel();
  const veSenha = meu !== "adivinhador";
  const bolinhas = r.palavras.map((x, i) => `<i class="${x.status} ${i === r.atual ? "atual" : ""}"></i>`).join("");
  const tentativas = bonus
    ? `<div class="tentativas">${Array.from({ length: TENTATIVAS_BONUS }, (_, i) => `<i class="${i < p.tentativas ? "usada" : ""}"></i>`).join("")}
       <span>Dica ${Math.min(p.tentativas + 1, TENTATIVAS_BONUS)} de ${TENTATIVAS_BONUS}</span></div>`
    : "";
  const placarBonus = bonus
    ? `<div class="placar-bonus"><span>Acertos <b>${acertos(r)} / ${ACERTOS_BONUS}</b></span>
       <span>Restam <b>${r.palavras.filter(x => x.status === "pendente").length}</b> senhas</span></div>`
    : "";
  const btnPausa = (estilo = "") => `<button class="btn sec pequeno" ${estilo} data-acao="jogo" data-tipo="pausar" aria-label="Pausar">⏸</button>`;
  const principais = bonus
    ? `<div class="linha"><button class="btn vermelho gigante" data-acao="jogo" data-tipo="errou">✗ Errou</button>
         <button class="btn verde gigante" data-acao="jogo" data-tipo="acertou">✓ Acertou!</button></div>`
    : `<div class="linha"><button class="btn sec gigante" data-acao="jogo" data-tipo="passar">↷ Passar</button>
         <button class="btn verde gigante" data-acao="jogo" data-tipo="acertou">✓ Acertou!</button></div>`;
  let botoes = "";
  if (meu === "local") {
    botoes = `${principais}<div class="acoes-menores">
      ${bonus ? `<button class="btn sec pequeno" data-acao="jogo" data-tipo="passar">Passar</button>` : ""}
      <button class="btn sec pequeno" data-acao="anular">${bonus ? "Anular" : "Anular (dica proibida)"}</button>
      ${btnPausa(bonus ? "" : 'style="flex:0 0 64px"')}</div>`;
  } else if (meu === "doador") {
    botoes = `${principais}<div class="acoes-menores">
      ${bonus ? `<button class="btn sec pequeno" data-acao="jogo" data-tipo="passar">Passar</button>` : ""}
      ${btnPausa(bonus ? 'style="flex:0 0 64px"' : "")}</div>`;
  } else if (meu === "fiscal") {
    botoes = `<div class="acoes-menores">
      <button class="btn vermelho" data-acao="anular">✋ Anular: dica proibida</button>
      ${btnPausa('style="flex:0 0 64px"')}</div>`;
  } else if (meu === "adivinhador") {
    botoes = `<div class="acoes-menores">${btnPausa()}</div>`;
  }
  const pausado = r.restantePausado != null;
  const cartao = veSenha
    ? `<span class="rotulo">SENHA</span>
       ${pausado ? `<span class="senha" style="font-size:2rem">• • •</span>` : `<span class="senha" style="font-size:${tamanhoSenha(p.texto)}">${esc(p.texto)}</span>`}
       ${p.status === "passada" && !pausado ? `<span class="voltou">voltou: tinha sido passada</span>` : ""}
       ${tentativas}`
    : `<span class="rotulo">ADIVINHE!</span>
       <span class="senha" style="font-size:6rem">?</span>
       <span class="mudo-escuro">Dicas de <b>${jogador(r.equipe, r.doador)}</b></span>
       ${tentativas}`;
  return `${faixaConexao()}<main class="jogo">
    <div class="barra-jogo">
      ${seloEquipe(r.equipe)}
      <div id="relogio" class="relogio ${alerta ? "alerta" : ""}">${mmss(ms)}</div>
    </div>
    <div id="trilha" class="trilha-tempo ${alerta ? "alerta" : ""}"><div style="width:${(ms / total) * 100}%"></div></div>
    <div class="bolinhas">${bolinhas}</div>
    ${placarBonus}
    <section class="senha-cartao ${veSenha ? "" : "oculta"}">${cartao}</section>
    ${botoes}
  </main>
  ${pausado ? `<div class="pausa"><h2>Pausado</h2><p class="mudo">A senha fica escondida enquanto o jogo está pausado.</p>
    ${pode("retomar") ? `<button class="btn gigante" data-acao="jogo" data-tipo="retomar" style="width:100%;max-width:360px">▶ Continuar</button>` : espera("Aguardando continuar…")}
    <button class="btn texto" data-acao="menu">Menu</button></div>` : ""}`;
}

function telaConferir() {
  const r = estado.rodada;
  const bonus = r.fase === "bonus";
  const adversaria = 1 - r.equipe;
  const confere = pode("confirmarConferencia");
  const titulos = {
    tempo: "⏰ Tempo esgotado!", todas: "🎉 Todas as senhas!", meta: "🎉 Meta atingida!", impossivel: "Não deu desta vez…",
  };
  const n = acertos(r);
  const itens = r.palavras.map((p, i) => {
    const conteudo = `<span class="txt">${esc(p.texto)}</span><span class="etiqueta ${p.status}">${ROTULO_STATUS[p.status]}</span>`;
    return p.acertou && confere
      ? `<button class="item-senha" data-acao="conferir" data-indice="${i}">${conteudo}</button>`
      : `<div class="item-senha">${conteudo}</div>`;
  }).join("");
  const total = bonus
    ? `<p class="total"><b>${n}</b> de ${ACERTOS_BONUS} necessários ${n >= ACERTOS_BONUS ? "✓" : "✗"}</p>`
    : `<p class="total"><b>${n}</b> ${n === 1 ? "ponto" : "pontos"} para ${nomeEquipe(r.equipe)}</p>`;
  const instrucao = confere
    ? `<p class="mudo"><b style="color:var(--eq${adversaria})">${nomeEquipe(adversaria)}</b>, confiram. Se alguma dica quebrou as regras,
        toquem na senha acertada para anular.</p>`
    : `<p class="mudo">A <b style="color:var(--eq${adversaria})">${nomeEquipe(adversaria)}</b> está conferindo as senhas.</p>`;
  return `${topo()}
  <main class="pilha">
    <h2 class="titulo-tela">${titulos[r.motivo] || "Fim da rodada"}</h2>
    ${instrucao}
    <div class="lista-senhas">${itens}</div>
    ${total}
    ${confere ? `<button class="btn gigante" data-acao="confirmarConferencia">Confirmar</button>` : espera("Aguardando a conferência…")}
  </main>`;
}

function cartaoPlacar(i, extra = "") {
  const eq = estado.equipes[i];
  return `<div class="cartao equipe-${i} ${extra}">
    <div class="nome">${nomeEquipe(i)}</div>
    <div class="pontos">${eq.pontos}</div>
    <div class="fraco">${eq.pontos === 1 ? "ponto" : "pontos"}</div>
    <div class="rodadas">${eq.rodadas.map(x => `<span>R${x.numero}: ${x.pontos}</span>`).join("")}</div>
  </div>`;
}

function telaPlacarInicial() {
  const primeiro = estado.ordemBonus[0];
  return `${topo()}
  <main class="pilha" style="flex:1">
    <h2 class="titulo-tela">Fim das rodadas iniciais</h2>
    <div class="placar">${cartaoPlacar(0, primeiro === 0 ? "lider" : "")}${cartaoPlacar(1, primeiro === 1 ? "lider" : "")}</div>
    <p class="cartao centro">${estado.empateInicial ? "Deu empate! No sorteio, " : ""}<b>${nomeEquipe(primeiro)}</b> joga primeiro a disputa pelo milhão.</p>
    <div class="espaco"></div>
    ${pode("irParaBonus") ? `<button class="btn gigante" data-acao="irParaBonus">Ir para as rodadas de bônus</button>` : espera("Aguardando os jogadores…")}
  </main>`;
}

function metaRival() {
  if (estado.indiceBonus !== 1) return "";
  const rival = estado.ordemBonus[0];
  const premio = estado.equipes[rival].bonus.premio;
  return `<p class="aviso">Para vencer: superar <b>${premio ? formatarValor(premio) : "R$ 0"}</b> da ${nomeEquipe(rival)}${premio === 0 ? " (qualquer prêmio já ganha)" : ""}.</p>`;
}

function telaEscolhaDoador() {
  const i = estado.ordemBonus[estado.indiceBonus];
  const escolhe = pode("escolherDoador");
  return `${topo()}
  <main class="pilha" style="flex:1">
    <div>${seloEquipe(i)}</div>
    <h2 class="titulo-tela">Rodadas de bônus</h2>
    <p class="mudo">Quem vai <b>dar as dicas</b> em todos os níveis? A outra pessoa adivinha até o fim.</p>
    ${metaRival()}
    <div class="espaco"></div>
    ${escolhe
      ? [0, 1].map(j => `<button class="btn gigante ${j ? "sec" : ""}" data-acao="doador" data-jogador="${j}">${jogador(i, j)} dá as dicas</button>`).join("")
      : espera(`A ${nomeEquipe(i)} está escolhendo quem dá as dicas…`)}
  </main>`;
}

function telaEscada() {
  const i = estado.ordemBonus[estado.indiceBonus];
  const eq = estado.equipes[i];
  const feitos = eq.bonus.niveis;
  const degraus = NIVEIS.map((n, k) => {
    const classe = k < feitos ? "feito" : k === feitos ? "atual" : "";
    const marca = k < feitos ? "✓" : k === feitos ? "▶" : "";
    return `<div class="degrau ${classe} ${k === NIVEIS.length - 1 ? "milhao" : ""}">
      <span class="marca-d">${marca}</span>
      <span class="valor">${formatarValor(n.valor)}${k === NIVEL_GARANTIDO - 1 ? " 🔒" : ""}</span>
      <span class="meta">5 de ${n.palavras}</span></div>`;
  }).reverse().join("");
  const atual = feitos > 0 ? NIVEIS[feitos - 1].valor : 0;
  const garantido = premioGarantido(feitos);
  return `${topo()}
  <main class="pilha" style="flex:1">
    <div class="selos" style="justify-content:space-between">${seloEquipe(i)}<span class="fraco">Dicas: <b>${jogador(i, eq.bonus.doador)}</b></span></div>
    <div class="escada">${degraus}</div>
    <p class="centro mudo">Prêmio atual: <b style="color:var(--texto)">${atual ? formatarValor(atual) : "R$ 0"}</b> ·
      Garantido: <b style="color:var(--texto)">${garantido ? formatarValor(garantido) : "R$ 0"}</b></p>
    ${metaRival()}
    <div class="espaco"></div>
    ${pode("jogarNivel")
      ? `<button class="btn gigante" data-acao="jogarNivel">Jogar ${formatarValor(NIVEIS[feitos].valor)}</button>
         ${feitos > 0 ? `<button class="btn sec" data-acao="parar">Parar e levar ${formatarValor(atual)}</button>` : ""}`
      : espera(feitos > 0 ? `A ${nomeEquipe(i)} está decidindo: continuar ou parar?` : `A ${nomeEquipe(i)} está se preparando…`)}
  </main>`;
}

function telaResultadoBonus() {
  const i = estado.ordemBonus[estado.indiceBonus];
  const b = estado.equipes[i].bonus;
  const frases = {
    milhao: ["🏆", "Ganharam o milhão!"],
    parou: ["💰", "Pararam na hora certa!"],
    falhou: [b.premio ? "🔒" : "😬", b.premio ? "Não passaram do nível, mas o valor garantido está salvo." : "Não completaram o nível e saem sem prêmio."],
  };
  const [emoji, frase] = frases[b.motivo];
  const ultimo = estado.indiceBonus === 1;
  return `${topo()}
  ${b.premio > 0 ? confete() : ""}
  <main class="resultado">
    <div>${seloEquipe(i)}</div>
    <div class="emoji">${emoji}</div>
    <p class="grande">${b.premio ? formatarValor(b.premio) : "R$ 0"}</p>
    <p class="mudo">${frase}</p>
    <div class="espaco"></div>
    ${pode("proximaEquipeBonus")
      ? `<button class="btn gigante" data-acao="proximaEquipeBonus">${ultimo ? "Ver resultado final" : `Vez da ${nomeEquipe(1 - i)}`}</button>`
      : espera("Aguardando os jogadores…")}
  </main>`;
}

function telaFim() {
  const v = vencedor(estado);
  const linha = i => {
    const eq = estado.equipes[i];
    return `<div class="cartao equipe-${i} ${v === i ? "lider" : ""}">
      <div class="nome">${nomeEquipe(i)}</div>
      <div class="pontos" style="font-size:1.7rem">${eq.bonus.premio ? formatarValor(eq.bonus.premio) : "R$ 0"}</div>
      <div class="fraco">${eq.pontos} pontos nas rodadas iniciais</div>
    </div>`;
  };
  const desempate = v !== null && estado.equipes[0].bonus.premio === estado.equipes[1].bonus.premio;
  let botoes;
  if (!sala) {
    botoes = `<button class="btn gigante" data-acao="revanche">Jogar de novo</button>
      <button class="btn texto" data-acao="sair">Voltar ao início</button>`;
  } else if (sala.souAnfitriao) {
    botoes = `<button class="btn gigante" data-acao="revancheSala">Jogar de novo</button>
      <button class="btn sec" data-acao="voltarLobby">Trocar equipes</button>`;
  } else {
    botoes = `${espera("Aguardando quem criou a sala…")}<button class="btn texto" data-acao="sairSala">Sair da sala</button>`;
  }
  return `${topo()}
  ${v !== null ? confete() : ""}
  <main class="resultado">
    <div class="emoji">${v === null ? "🤝" : "🏆"}</div>
    <p class="grande">${v === null ? "Empate!" : nomeEquipe(v)}</p>
    <p class="mudo">${v === null ? "Mesmo prêmio e mesmos pontos. Revanche?" : desempate ? "Venceu no desempate pelos pontos das rodadas iniciais!" : "Venceu a disputa pelo milhão!"}</p>
    <div class="placar">${linha(0)}${linha(1)}</div>
    <div class="espaco"></div>
    ${botoes}
  </main>`;
}

function confete() {
  const cores = ["#F7B500", "#FFE68A", "#38BDF8", "#FB923C", "#22C55E", "#FFFFFF"];
  const pecas = Array.from({ length: 60 }, () => {
    const cor = cores[Math.floor(Math.random() * cores.length)];
    return `<i style="left:${Math.random() * 100}%;background:${cor};animation-duration:${2.2 + Math.random() * 2.5}s;animation-delay:${Math.random() * 0.8}s"></i>`;
  }).join("");
  return `<div class="confete" aria-hidden="true">${pecas}</div>`;
}

// ---------- render ----------

const TELAS_JOGO = {
  passe: telaPasse, jogando: telaJogando, conferir: telaConferir, placarInicial: telaPlacarInicial,
  escolhaDoador: telaEscolhaDoador, escada: telaEscada, resultadoBonus: telaResultadoBonus, fim: telaFim,
};

let telaAnterior = null;
function render() {
  let html;
  if (ui.tela === "regras") html = telaRegras();
  else if (ui.tela === "config") html = telaConfig();
  else if (ui.tela === "salaEntrada") html = telaEntradaSala();
  else if (ui.tela === "sala") {
    if (!sala?.dados) html = `${topo(false)}<main class="resultado">${espera("Conectando à sala…")}</main>`;
    else if (sala.dados.lobby?.fase !== "jogo" || !estado) html = telaLobby();
    else html = TELAS_JOGO[estado.tela]();
  } else if (ui.tela !== "jogo" || !estado) html = telaInicio();
  else html = TELAS_JOGO[estado.tela]();
  if (ui.contagem != null) html += `<div class="contagem"><span>${ui.contagem}</span></div>`;

  // não redesenha em cima de quem está digitando no nome da equipe
  const foco = document.activeElement;
  const digitando = foco?.matches?.("input[type=text]") ? foco.id || foco.dataset.equipeNome : null;
  const valorDigitado = digitando != null ? foco.value : null;

  app.innerHTML = html;

  if (digitando != null) {
    const novo = document.getElementById(digitando) || app.querySelector(`[data-equipe-nome="${digitando}"]`);
    if (novo) { novo.value = valorDigitado; novo.focus(); }
  }
  preencherQR();
  const qual = `${ui.tela}/${sala?.dados?.lobby?.fase}/${estado?.tela}/${estado?.indiceRodada}/${estado?.rodada?.nivel}`;
  if (qual !== telaAnterior) window.scrollTo(0, 0);
  telaAnterior = qual;
}

// ---------- relógio ----------

let ultimoSegundo = null;
setInterval(() => {
  const naPartida = (ui.tela === "jogo" && !sala) || (ui.tela === "sala" && sala?.dados?.lobby?.fase === "jogo");
  if (!naPartida || estado?.tela !== "jogando") {
    if (sala && ui.contagem != null) { ui.contagem = null; render(); }
    return;
  }
  const agora = agoraAtual();

  if (sala) {
    // contagem 3, 2, 1 que todos os celulares veem ao mesmo tempo
    if (emContagem(estado, agora)) {
      const n = Math.ceil((estado.rodada.inicioEm - agora) / 1000);
      if (n !== ui.contagem) { ui.contagem = n; som.contagem(); render(); }
      return;
    }
    if (ui.contagem != null) { ui.contagem = null; som.vai(); render(); }
  }

  const ms = restante(estado, agora);
  if (ms <= 0) {
    if (!sala) despachar("tempoEsgotado");
    else if (sala.souAnfitriao) processarPedido({ uid: sala.uid, tipo: "tempoEsgotado", seq: estadoHost?.seq });
    return;
  }
  const relogio = document.getElementById("relogio");
  const trilha = document.getElementById("trilha");
  if (!relogio || !trilha) return;
  const alerta = ms <= 5000;
  relogio.textContent = mmss(ms);
  relogio.classList.toggle("alerta", alerta);
  trilha.classList.toggle("alerta", alerta);
  trilha.firstElementChild.style.width = `${(ms / tempoDaRodada(estado)) * 100}%`;
  const s = Math.ceil(ms / 1000);
  if (estado.rodada.restantePausado == null && alerta && s !== ultimoSegundo) som.tique();
  ultimoSegundo = s;
}, 150);

function contagemRegressiva() {
  if (ui.contagem != null) return;
  let n = 3;
  ui.contagem = n;
  som.contagem();
  render();
  const passo = setInterval(() => {
    n--;
    if (n > 0) { ui.contagem = n; som.contagem(); render(); return; }
    clearInterval(passo);
    ui.contagem = null;
    som.vai();
    despachar("comecar");
  }, 800);
}

// ---------- diálogos ----------

function confirmar(titulo, texto, rotuloSim, sim, perigo = true, nao = null) {
  dialogo.innerHTML = `<h2>${titulo}</h2><p>${texto}</p>
    <div class="pilha"><button class="btn ${perigo ? "vermelho" : ""}" data-d="sim">${rotuloSim}</button>
    <button class="btn sec" data-d="nao">Cancelar</button></div>`;
  dialogo.onclick = e => {
    const b = e.target.closest("[data-d]");
    if (!b) return;
    dialogo.close();
    if (b.dataset.d === "sim") sim();
    else nao?.();
  };
  dialogo.oncancel = () => nao?.(); // tecla Esc / botão voltar
  dialogo.showModal();
}

function avisar(titulo, texto) {
  if (dialogo.open) dialogo.close();
  dialogo.innerHTML = `<h2>${titulo}</h2><p>${texto}</p><div class="pilha"><button class="btn" data-d="ok">OK</button></div>`;
  dialogo.oncancel = null;
  dialogo.onclick = e => { if (e.target.closest("[data-d]")) dialogo.close(); };
  dialogo.showModal();
}

function abrirMenu() {
  const emJogo = estado?.tela === "jogando" && (!sala || sala.dados?.lobby?.fase === "jogo");
  const ligado = somLigado();
  const titulo = sala ? `Sala ${esc(sala.codigo)}` : `Partida: ${nomeEquipe(0)} × ${nomeEquipe(1)}`;
  const opcoesSala = sala
    ? `<button class="btn sec" data-m="convite">📤 Mandar convite da sala</button>
       ${sala.souAnfitriao && estado ? `<button class="btn sec" data-m="lobby">Voltar para a sala (encerra a partida)</button>` : ""}
       ${sala.souAnfitriao
         ? `<button class="btn vermelho" data-m="encerrar">Encerrar a sala para todos</button>`
         : `<button class="btn vermelho" data-m="sairSala">Sair da sala</button>`}`
    : `<button class="btn vermelho" data-m="sair">Encerrar partida</button>`;
  dialogo.innerHTML = `<h2>Menu</h2><p>${titulo}</p>
    <div class="pilha">
      ${emJogo && estado.rodada.restantePausado == null && pode("pausar") ? `<button class="btn" data-m="pausar">⏸ Pausar o tempo</button>` : ""}
      <button class="btn sec" data-m="som">${ligado ? "🔇 Desligar sons" : "🔊 Ligar sons"}</button>
      <button class="btn sec" data-m="regras">Ver regras</button>
      ${opcoesSala}
      <button class="btn texto" data-m="fechar">Fechar</button>
    </div>`;
  dialogo.oncancel = null;
  dialogo.onclick = e => {
    const b = e.target.closest("[data-m]");
    if (!b) return;
    dialogo.close();
    const m = b.dataset.m;
    if (m === "pausar") despachar("pausar");
    if (m === "som") {
      if (sala) gravar(CHAVE_SOM, !ligado);
      else { estado.config.som = !ligado; gravar(CHAVE_PARTIDA, estado); }
    }
    if (m === "regras") {
      if (emJogo && !sala) despachar("pausar");
      ui.voltarPara = ui.tela; ui.tela = "regras"; render();
    }
    if (m === "sair") {
      if (emJogo) despachar("pausar");
      confirmar("Encerrar partida?", "O placar desta partida será perdido.", "Encerrar", sairDaPartida);
    }
    if (m === "convite") compartilhar();
    if (m === "lobby") confirmar("Voltar para a sala?", "A partida atual termina para todos e vocês podem trocar as equipes.", "Voltar para a sala", voltarLobby);
    if (m === "encerrar") confirmar("Encerrar a sala?", "Todos saem da sala e a partida é perdida.", "Encerrar sala", encerrarSalaParaTodos);
    if (m === "sairSala") confirmar("Sair da sala?", estado ? "A partida fica parada sem você. Dá para voltar pelo mesmo link." : "Você pode voltar pelo mesmo link.", "Sair", sairDaSala);
  };
  dialogo.showModal();
}

function sairDaPartida() {
  estado = null;
  gravar(CHAVE_PARTIDA, null);
  manterTelaLigada(false);
  ui.tela = "inicio";
  render();
}

// ---------- configuração (um celular) ----------

function lerFormulario() {
  app.querySelectorAll("input[data-eq]").forEach(inp => {
    const eq = ui.config.equipes[inp.dataset.eq];
    if (inp.dataset.campo === "nome") eq.nome = inp.value;
    else eq.jogadores[inp.dataset.j] = inp.value;
  });
}

function iniciarPartida(base) {
  const equipes = base.equipes.map((e, i) => ({
    nome: e.nome.trim() || `Equipe ${i + 1}`,
    jogadores: e.jogadores.map((j, k) => j.trim() || `Jogador ${i * 2 + k + 1}`),
  }));
  gravar(CHAVE_CONFIG, { equipes, config: base.config });
  estado = novoJogo({ equipes, config: base.config }, ctx());
  gravar(CHAVE_PARTIDA, estado);
  ui.tela = "jogo";
  render();
}

// ---------- modo sala ----------

async function carregarSala() {
  S ||= await import("./sala.js");
  return S;
}

function lerNome() {
  const nome = (document.getElementById("meuNome")?.value || "").trim();
  if (!nome) { ui.erro = "Digite o seu nome."; render(); document.getElementById("meuNome")?.focus(); return null; }
  gravar(CHAVE_NOME, nome);
  return nome;
}

async function criarOuEntrar(acao) {
  const nome = lerNome();
  if (!nome) return;
  const codigo = acao === "entrar" ? (await carregarSala().then(m => m.normalizarCodigo(document.getElementById("codigoSala")?.value))) : null;
  if (acao === "entrar" && (!codigo || codigo.length !== 4)) { ui.erro = "O código da sala tem 4 letras/números."; render(); return; }
  ui.erro = null; ui.ocupado = true; render();
  try {
    await carregarSala();
    const config = { ...CONFIG_PADRAO };
    const c = acao === "criar" ? await S.criarSala(nome, config) : (await S.entrarSala(codigo, nome), codigo);
    abrirSalaConectada(c);
  } catch (e) {
    ui.erro = e?.message?.startsWith("Sala") || e?.message?.startsWith("Não") ? e.message : "Não consegui conectar. Confira a internet e tente de novo.";
    console.error(e);
  } finally {
    ui.ocupado = false;
    render();
  }
}

function abrirSalaConectada(codigo) {
  if (sala) fecharOuvintes();
  estado = null;
  estadoHost = null;
  sala = { codigo, dados: null, uid: S.meuUid(), souAnfitriao: false };
  gravar(CHAVE_SALA, codigo);
  try { history.replaceState(null, "", `${location.pathname}?sala=${codigo}`); } catch { /* sem histórico */ }
  ui.tela = "sala";
  manterTelaLigada(true);
  sala.pararConexao = S.aoMudarConexao(() => render());
  sala.pararOuvir = S.ouvirSala(codigo, dados => aoMudarSala(codigo, dados));
}

function aoMudarSala(codigo, dados) {
  if (!sala || sala.codigo !== codigo) return;
  if (!dados) {
    deixarSala();
    avisar("Sala encerrada", "Quem criou a sala encerrou a partida.");
    return;
  }
  const antes = estado;
  sala.dados = dados;
  sala.souAnfitriao = dados.anfitriao === sala.uid;
  estado = dados.lobby?.fase === "jogo" ? dados.estado : null;
  if (sala.souAnfitriao) {
    estadoHost = estado;
    if (!sala.pararPedidos) sala.pararPedidos = S.atenderPedidos(codigo, processarPedido);
  }
  if (antes && estado && antes.seq !== estado.seq) efeitos(antes, estado, inferirTipo(antes, estado));
  render();
}

function fecharOuvintes() {
  sala?.pararOuvir?.();
  sala?.pararPedidos?.();
  sala?.pararConexao?.();
}

function deixarSala() {
  fecharOuvintes();
  sala = null;
  estadoHost = null;
  gravar(CHAVE_SALA, null);
  try { history.replaceState(null, "", location.pathname); } catch { /* sem histórico */ }
  estado = ler(CHAVE_PARTIDA);
  ui.tela = "inicio";
  ui.contagem = null;
  manterTelaLigada(false);
  render();
}

async function sairDaSala() {
  if (!sala) return;
  const noLobby = sala.dados?.lobby?.fase !== "jogo";
  await S.sairSala(sala.codigo, noLobby);
  deixarSala();
}

async function encerrarSalaParaTodos() {
  if (!sala) return;
  const codigo = sala.codigo;
  await S.sairSala(codigo, false);
  fecharOuvintes();
  await S.encerrarSala(codigo).catch(() => {});
  deixarSala();
}

function iniciarPartidaSala() {
  const d = sala.dados;
  const m = membros(d);
  if (m.equipes[0].length !== 2 || m.equipes[1].length !== 2) return;
  const equipes = [0, 1].map(i => ({ nome: d.lobby.equipes[i].nome || `Equipe ${i + 1}`, jogadores: m.equipes[i].map(j => j.nome) }));
  const novo = novoJogo({ equipes, config: { ...d.lobby.config, som: true } }, ctx());
  novo.uids = m.equipes.map(l => l.map(j => j.uid));
  novo.seq = 1;
  estadoHost = novo;
  S.gravarEstado(sala.codigo, novo);
}

function revancheSala() {
  const anterior = estadoHost;
  const novo = novoJogo({ equipes: anterior.equipes.map(e => ({ nome: e.nome, jogadores: e.jogadores })), config: anterior.config }, ctx());
  novo.uids = anterior.uids;
  novo.seq = (anterior.seq || 0) + 1;
  estadoHost = novo;
  S.gravarEstado(sala.codigo, novo);
}

function voltarLobby() {
  estadoHost = null;
  S.gravarEstado(sala.codigo, null, "lobby");
}

async function compartilhar() {
  const url = linkConvite();
  const texto = `Vamos jogar Palavra-Chave! Entre na sala ${sala.codigo}:`;
  try {
    if (navigator.share) { await navigator.share({ title: "Palavra-Chave", text: texto, url }); return; }
  } catch (e) { if (e?.name === "AbortError") return; }
  try {
    await navigator.clipboard.writeText(`${texto} ${url}`);
    avisar("Convite copiado", "Cole no WhatsApp para chamar o pessoal.");
  } catch {
    avisar("Convite", `Mande este link: ${esc(url)}`);
  }
}

// ---------- eventos ----------

app.addEventListener("click", e => {
  const alvo = e.target.closest("[data-acao]");
  if (!alvo || alvo.disabled) return;
  const d = alvo.dataset;
  switch (d.acao) {
    case "novo":
      if (estado && estado.tela !== "fim") {
        confirmar("Começar outro jogo?", "A partida em andamento será descartada.", "Começar outro", () => {
          estado = null; gravar(CHAVE_PARTIDA, null); ui.config = configInicial(); ui.tela = "config"; render();
        });
        return;
      }
      ui.config = configInicial(); ui.tela = "config"; render(); break;
    case "continuar":
      ui.tela = "jogo"; render(); break;
    case "regras":
      ui.voltarPara = ui.tela; ui.tela = "regras"; render(); break;
    case "voltarInicio":
      if (ui.tela === "regras" && ui.voltarPara && ui.voltarPara !== "regras") ui.tela = ui.voltarPara;
      else ui.tela = "inicio";
      if (ui.tela === "jogo" && !estado) ui.tela = "inicio";
      if (ui.tela === "sala" && !sala) ui.tela = "inicio";
      ui.voltarPara = null; ui.erro = null; render(); break;
    case "cfg":
      lerFormulario(); ui.config.config[d.campo] = Number(d.valor); render(); break;
    case "cfgCheck":
      lerFormulario(); ui.config.config[d.campo] = alvo.checked; break;
    case "iniciar":
      lerFormulario(); iniciarPartida(ui.config); break;
    case "menu":
      abrirMenu(); break;
    case "contagem":
      contagemRegressiva(); break;
    case "comecarRodada":
      despachar("comecar"); break;
    case "jogo": {
      const dados = estado?.rodada ? { indice: estado.rodada.atual } : {};
      despachar(d.tipo, dados); break;
    }
    case "anular": {
      const indice = estado.rodada.atual;
      if (sala) {
        // no modo sala o tempo não para durante a confirmação: é um toque de quem fiscaliza
        confirmar("Anular esta senha?", "A dica quebrou uma regra? A senha não vale ponto e não volta mais.", "Anular",
          () => despachar("anular", { indice }));
        break;
      }
      despachar("pausar");
      confirmar("Anular esta senha?", "Use quando a dica quebrou uma regra. A senha não vale ponto e não volta mais.", "Anular",
        () => { despachar("retomar"); despachar("anular", { indice }); },
        true,
        () => despachar("retomar"));
      break;
    }
    case "conferir":
      despachar("alternarConferencia", { indice: Number(d.indice) }); break;
    case "confirmarConferencia":
    case "irParaBonus":
    case "jogarNivel":
    case "proximaEquipeBonus":
      despachar(d.acao); break;
    case "doador":
      despachar("escolherDoador", { jogador: Number(d.jogador) }); break;
    case "parar": {
      const eq = estado.equipes[estado.ordemBonus[estado.indiceBonus]];
      const valor = formatarValor(NIVEIS[eq.bonus.niveis - 1].valor);
      confirmar("Parar agora?", `A equipe sai do bônus levando ${valor}.`, `Parar com ${valor}`, () => despachar("parar"), false);
      break;
    }
    case "revanche":
      iniciarPartida({ equipes: estado.equipes, config: estado.config }); break;
    case "sair":
      sairDaPartida(); break;

    // modo sala
    case "abrirSala":
      ui.erro = null; ui.codigoConvite = ""; ui.tela = "salaEntrada"; render(); break;
    case "criarSala":
      criarOuEntrar("criar"); break;
    case "entrarSala":
      criarOuEntrar("entrar"); break;
    case "compartilhar":
      compartilhar(); break;
    case "escolherEquipe":
      S.escolherEquipe(sala.codigo, sala.uid, Number(d.equipe)); break;
    case "tirarDaEquipe":
      if (sala.souAnfitriao) S.escolherEquipe(sala.codigo, d.uid, null); break;
    case "salaCfg":
      if (sala.souAnfitriao) S.atualizarLobby(sala.codigo, { config: { ...sala.dados.lobby.config, [d.campo]: Number(d.valor) } }); break;
    case "salaCfgCheck":
      if (sala.souAnfitriao) S.atualizarLobby(sala.codigo, { config: { ...sala.dados.lobby.config, [d.campo]: alvo.checked } }); break;
    case "comecarSala":
      if (sala.souAnfitriao) iniciarPartidaSala(); break;
    case "revancheSala":
      if (sala.souAnfitriao) revancheSala(); break;
    case "voltarLobby":
      if (sala.souAnfitriao) voltarLobby(); break;
    case "sairSala":
      confirmar("Sair da sala?", "Você pode voltar pelo mesmo link.", "Sair", sairDaSala); break;
  }
});

app.addEventListener("change", e => {
  const inp = e.target.closest("[data-equipe-nome]");
  if (!inp || !sala?.souAnfitriao) return;
  const i = Number(inp.dataset.equipeNome);
  const equipes = sala.dados.lobby.equipes.map((x, k) => ({ nome: k === i ? (inp.value.trim() || `Equipe ${k + 1}`) : x.nome }));
  inp.blur();
  S.atualizarLobby(sala.codigo, { equipes });
});

app.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  if (e.target.id === "codigoSala") criarOuEntrar("entrar");
  if (e.target.matches?.("[data-equipe-nome]")) e.target.blur();
});

// ---------- início ----------

if (estado && estado.versao !== 1) { estado = null; gravar(CHAVE_PARTIDA, null); }
else if (estado?.tela === "jogando") despachar("pausar"); // recarregou no meio da rodada: pausa

const convite = (codigoDaUrl() || ler(CHAVE_SALA) || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
if (convite.length === 4) {
  ui.codigoConvite = convite;
  ui.tela = "salaEntrada";
  const nome = ler(CHAVE_NOME);
  if (nome) {
    // volta direto para a sala (recarregou a página ou abriu o convite de novo)
    ui.ocupado = true;
    carregarSala()
      .then(() => S.entrarSala(convite, nome))
      .then(() => abrirSalaConectada(convite))
      .catch(e => {
        gravar(CHAVE_SALA, null);
        ui.erro = e?.message?.startsWith("Sala") ? e.message : "Não consegui conectar. Confira a internet e tente de novo.";
      })
      .finally(() => { ui.ocupado = false; render(); });
  }
}
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
