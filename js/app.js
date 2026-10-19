import {
  agir, novoJogo, restante, acertos, tempoDaRodada, vencedor, formatarValor, premioGarantido,
  NIVEIS, NIVEL_GARANTIDO, ACERTOS_BONUS, TENTATIVAS_BONUS, RODADAS_INICIAIS, CONFIG_PADRAO,
} from "./jogo.js";
import { BANCO } from "./palavras.js";

const CHAVE_PARTIDA = "palavraChave.partida";
const CHAVE_USADAS = "palavraChave.usadas";
const CHAVE_CONFIG = "palavraChave.ultimaConfig";

const app = document.getElementById("app");
const dialogo = document.getElementById("dialogo");

let estado = ler(CHAVE_PARTIDA);
let ui = { tela: "inicio", contagem: null, config: null };

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

function ctx() {
  return { agora: Date.now(), aleatorio: Math.random, sortear };
}

// ---------- despacho ----------

function despachar(tipo, dados) {
  const antes = estado;
  estado = agir(estado, tipo, dados, ctx());
  if (estado === antes) return;
  gravar(CHAVE_PARTIDA, estado);
  efeitos(antes, estado, tipo);
  render();
}

function efeitos(antes, depois, tipo) {
  if (tipo === "acertou") { som.acerto(); vibrar(40); }
  if (tipo === "errou") { som.erro(); vibrar(80); }
  if (tipo === "passar") som.passar();
  if (tipo === "anular") { som.erro(); vibrar([60, 40, 60]); }
  if (depois.tela === "jogando" && antes.tela !== "jogando") manterTelaLigada(true);
  if (antes.tela === "jogando" && depois.tela !== "jogando") {
    manterTelaLigada(false);
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

let audio = null;
function tom(freq, dur, tipo = "sine", vol = 0.18, atraso = 0) {
  if (!(estado?.config?.som ?? ler(CHAVE_CONFIG)?.config?.som ?? true)) return;
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
async function manterTelaLigada(ligar) {
  try {
    if (ligar && !travaTela && navigator.wakeLock) travaTela = await navigator.wakeLock.request("screen");
    if (!ligar && travaTela) { await travaTela.release(); travaTela = null; }
  } catch { travaTela = null; }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && estado?.tela === "jogando") { travaTela = null; manterTelaLigada(true); }
});

// ---------- utilidades de interface ----------

function esc(t) {
  return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function nomeEquipe(i) { return esc(estado.equipes[i].nome); }
function jogador(eq, j) { return esc(estado.equipes[eq].jogadores[j]); }
function seloEquipe(i) {
  return `<span class="selo equipe equipe-${i}"><span class="ponto-cor"></span>${nomeEquipe(i)}</span>`;
}
function mmss(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function topo(menu = true) {
  return `<header class="topo">
    <img src="icons/icone-192.png" alt="">
    <div class="marca-mini">Palavra<span>-</span>Chave</div>
    ${menu ? `<button class="btn-icone" data-acao="menu" aria-label="Menu">☰</button>` : ""}
  </header>`;
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
      <button class="btn ${temPartida ? "sec" : ""}" data-acao="novo">Novo jogo · 1 celular</button>
      <button class="btn sec" disabled>Vários celulares · em breve</button>
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

function telaConfig() {
  const c = ui.config;
  const seg = (campo, valores) => `<div class="segmentos">${valores.map(v =>
    `<button type="button" data-acao="cfg" data-campo="${campo}" data-valor="${v}" aria-pressed="${c.config[campo] === v}">${v}s</button>`).join("")}</div>`;
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
      <div class="campo"><label>Tempo das rodadas iniciais</label>${seg("tempoInicial", [30, 45, 60])}</div>
      <div class="campo"><label>Tempo de cada nível do bônus</label>${seg("tempoBonus", [90, 120, 150])}</div>
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
    <div class="pilha" style="margin-top:22px">
      <button class="btn" data-acao="voltarInicio">Entendi</button>
    </div>
  </main>`;
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
  return `${topo()}
  <main class="passe">
    <div class="selos">${seloEquipe(r.equipe)} ${fase}</div>
    <p class="mudo">Entregue o celular para</p>
    <p class="nome-grande">${jogador(r.equipe, r.doador)}</p>
    <p class="mudo">que vai dar as dicas. Não mostre a tela para quem adivinha!</p>
    <div class="papeis">
      <div class="cartao"><span class="fraco">Adivinha</span><b>${jogador(r.equipe, r.adivinhador)}</b></div>
      <div class="cartao equipe-${adversaria}"><span class="fraco">Fiscaliza</span><b style="color:var(--cor)">${nomeEquipe(adversaria)}</b></div>
    </div>
    <p class="mudo">${resumo}</p>
    ${bonus ? `<p class="aviso">As senhas deste nível já foram sorteadas: agora não dá mais para desistir.</p>` : ""}
    <div class="espaco"></div>
    <button class="btn gigante" data-acao="contagem">Estou pronto!</button>
  </main>`;
}

function telaJogando() {
  const r = estado.rodada;
  const p = r.palavras[r.atual];
  const bonus = r.fase === "bonus";
  const ms = restante(estado, Date.now());
  const total = tempoDaRodada(estado);
  const alerta = ms <= 5000;
  const bolinhas = r.palavras.map((x, i) => `<i class="${x.status} ${i === r.atual ? "atual" : ""}"></i>`).join("");
  const tentativas = bonus
    ? `<div class="tentativas">${Array.from({ length: TENTATIVAS_BONUS }, (_, i) => `<i class="${i < p.tentativas ? "usada" : ""}"></i>`).join("")}
       <span>Dica ${Math.min(p.tentativas + 1, TENTATIVAS_BONUS)} de ${TENTATIVAS_BONUS}</span></div>`
    : "";
  const placarBonus = bonus
    ? `<div class="placar-bonus"><span>Acertos <b>${acertos(r)} / ${ACERTOS_BONUS}</b></span>
       <span>Restam <b>${r.palavras.filter(x => x.status === "pendente").length}</b> senhas</span></div>`
    : "";
  const botoes = bonus
    ? `<div class="linha"><button class="btn vermelho gigante" data-acao="jogo" data-tipo="errou">✗ Errou</button>
         <button class="btn verde gigante" data-acao="jogo" data-tipo="acertou">✓ Acertou!</button></div>
       <div class="acoes-menores">
         <button class="btn sec pequeno" data-acao="jogo" data-tipo="passar">Passar</button>
         <button class="btn sec pequeno" data-acao="anular">Anular</button>
         <button class="btn sec pequeno" data-acao="jogo" data-tipo="pausar" aria-label="Pausar">⏸</button></div>`
    : `<div class="linha"><button class="btn sec gigante" data-acao="jogo" data-tipo="passar">↷ Passar</button>
         <button class="btn verde gigante" data-acao="jogo" data-tipo="acertou">✓ Acertou!</button></div>
       <div class="acoes-menores">
         <button class="btn sec pequeno" data-acao="anular">Anular (dica proibida)</button>
         <button class="btn sec pequeno" style="flex:0 0 64px" data-acao="jogo" data-tipo="pausar" aria-label="Pausar">⏸</button></div>`;
  const pausado = r.restantePausado != null;
  return `<main class="jogo">
    <div class="barra-jogo">
      ${seloEquipe(r.equipe)}
      <div id="relogio" class="relogio ${alerta ? "alerta" : ""}">${mmss(ms)}</div>
    </div>
    <div id="trilha" class="trilha-tempo ${alerta ? "alerta" : ""}"><div style="width:${(ms / total) * 100}%"></div></div>
    <div class="bolinhas">${bolinhas}</div>
    ${placarBonus}
    <section class="senha-cartao">
      <span class="rotulo">SENHA</span>
      ${pausado ? `<span class="senha" style="font-size:2rem">• • •</span>` : `<span class="senha" style="font-size:${tamanhoSenha(p.texto)}">${esc(p.texto)}</span>`}
      ${p.status === "passada" && !pausado ? `<span class="voltou">voltou: tinha sido passada</span>` : ""}
      ${tentativas}
    </section>
    ${botoes}
  </main>
  ${pausado ? `<div class="pausa"><h2>Pausado</h2><p class="mudo">A senha fica escondida enquanto o jogo está pausado.</p>
    <button class="btn gigante" data-acao="jogo" data-tipo="retomar" style="width:100%;max-width:360px">▶ Continuar</button>
    <button class="btn texto" data-acao="menu">Menu</button></div>` : ""}`;
}

function telaConferir() {
  const r = estado.rodada;
  const bonus = r.fase === "bonus";
  const adversaria = 1 - r.equipe;
  const titulos = {
    tempo: "⏰ Tempo esgotado!", todas: "🎉 Todas as senhas!", meta: "🎉 Meta atingida!", impossivel: "Não deu desta vez…",
  };
  const n = acertos(r);
  const itens = r.palavras.map((p, i) => {
    const conteudo = `<span class="txt">${esc(p.texto)}</span><span class="etiqueta ${p.status}">${ROTULO_STATUS[p.status]}</span>`;
    return p.acertou
      ? `<button class="item-senha" data-acao="conferir" data-indice="${i}">${conteudo}</button>`
      : `<div class="item-senha">${conteudo}</div>`;
  }).join("");
  const total = bonus
    ? `<p class="total"><b>${n}</b> de ${ACERTOS_BONUS} necessários ${n >= ACERTOS_BONUS ? "✓" : "✗"}</p>`
    : `<p class="total"><b>${n}</b> ${n === 1 ? "ponto" : "pontos"} para ${nomeEquipe(r.equipe)}</p>`;
  return `${topo()}
  <main class="pilha">
    <h2 class="titulo-tela">${titulos[r.motivo] || "Fim da rodada"}</h2>
    <p class="mudo"><b style="color:var(--eq${adversaria})">${nomeEquipe(adversaria)}</b>, confiram. Se alguma dica quebrou as regras,
      toquem na senha acertada para anular.</p>
    <div class="lista-senhas">${itens}</div>
    ${total}
    <button class="btn gigante" data-acao="confirmarConferencia">Confirmar</button>
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
    <button class="btn gigante" data-acao="irParaBonus">Ir para as rodadas de bônus</button>
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
  return `${topo()}
  <main class="pilha" style="flex:1">
    <div>${seloEquipe(i)}</div>
    <h2 class="titulo-tela">Rodadas de bônus</h2>
    <p class="mudo">Quem vai <b>dar as dicas</b> em todos os níveis? A outra pessoa adivinha até o fim.</p>
    ${metaRival()}
    <div class="espaco"></div>
    ${[0, 1].map(j => `<button class="btn gigante ${j ? "sec" : ""}" data-acao="doador" data-jogador="${j}">${jogador(i, j)} dá as dicas</button>`).join("")}
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
    <button class="btn gigante" data-acao="jogarNivel">Jogar ${formatarValor(NIVEIS[feitos].valor)}</button>
    ${feitos > 0 ? `<button class="btn sec" data-acao="parar">Parar e levar ${formatarValor(atual)}</button>` : ""}
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
    <button class="btn gigante" data-acao="proximaEquipeBonus">${ultimo ? "Ver resultado final" : `Vez da ${nomeEquipe(1 - i)}`}</button>
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
  return `${topo()}
  ${v !== null ? confete() : ""}
  <main class="resultado">
    <div class="emoji">${v === null ? "🤝" : "🏆"}</div>
    <p class="grande">${v === null ? "Empate!" : nomeEquipe(v)}</p>
    <p class="mudo">${v === null ? "Mesmo prêmio e mesmos pontos. Revanche?" : desempate ? "Venceu no desempate pelos pontos das rodadas iniciais!" : "Venceu a disputa pelo milhão!"}</p>
    <div class="placar">${linha(0)}${linha(1)}</div>
    <div class="espaco"></div>
    <button class="btn gigante" data-acao="revanche">Jogar de novo</button>
    <button class="btn texto" data-acao="sair">Voltar ao início</button>
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

function render() {
  let html;
  if (ui.tela === "regras") html = telaRegras();
  else if (ui.tela === "config") html = telaConfig();
  else if (ui.tela !== "jogo" || !estado) html = telaInicio();
  else {
    html = {
      passe: telaPasse, jogando: telaJogando, conferir: telaConferir, placarInicial: telaPlacarInicial,
      escolhaDoador: telaEscolhaDoador, escada: telaEscada, resultadoBonus: telaResultadoBonus, fim: telaFim,
    }[estado.tela]();
  }
  if (ui.contagem != null) html += `<div class="contagem"><span>${ui.contagem}</span></div>`;
  app.innerHTML = html;
  const qual = `${ui.tela}/${estado?.tela}/${estado?.indiceRodada}/${estado?.rodada?.nivel}`;
  if (qual !== telaAnterior) window.scrollTo(0, 0);
  telaAnterior = qual;
}
let telaAnterior = null;

// ---------- relógio ----------

let ultimoSegundo = null;
setInterval(() => {
  if (ui.tela !== "jogo" || estado?.tela !== "jogando") return;
  const ms = restante(estado, Date.now());
  if (ms <= 0) { despachar("tempoEsgotado"); return; }
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

function abrirMenu() {
  const somLigado = estado?.config?.som ?? true;
  const emJogo = estado?.tela === "jogando";
  dialogo.innerHTML = `<h2>Menu</h2><p>Partida: ${nomeEquipe(0)} × ${nomeEquipe(1)}</p>
    <div class="pilha">
      ${emJogo && estado.rodada.restantePausado == null ? `<button class="btn" data-m="pausar">⏸ Pausar o tempo</button>` : ""}
      <button class="btn sec" data-m="som">${somLigado ? "🔇 Desligar sons" : "🔊 Ligar sons"}</button>
      <button class="btn sec" data-m="regras">Ver regras</button>
      <button class="btn vermelho" data-m="sair">Encerrar partida</button>
      <button class="btn texto" data-m="fechar">Fechar</button>
    </div>`;
  dialogo.oncancel = null;
  dialogo.onclick = e => {
    const b = e.target.closest("[data-m]");
    if (!b) return;
    dialogo.close();
    const m = b.dataset.m;
    if (m === "pausar") despachar("pausar");
    if (m === "som") { estado.config.som = !somLigado; gravar(CHAVE_PARTIDA, estado); }
    if (m === "regras") {
      if (emJogo) despachar("pausar");
      ui.tela = "regras"; ui.voltarPara = "jogo"; render();
    }
    if (m === "sair") {
      if (emJogo) despachar("pausar");
      confirmar("Encerrar partida?", "O placar desta partida será perdido.", "Encerrar", sairDaPartida);
    }
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

// ---------- configuração ----------

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

// ---------- eventos ----------

app.addEventListener("click", e => {
  const alvo = e.target.closest("[data-acao]");
  if (!alvo) return;
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
      ui.tela = "regras"; ui.voltarPara = "inicio"; render(); break;
    case "voltarInicio":
      ui.tela = ui.voltarPara === "jogo" && estado ? "jogo" : "inicio"; ui.voltarPara = null; render(); break;
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
    case "jogo":
      despachar(d.tipo); break;
    case "anular":
      despachar("pausar");
      confirmar("Anular esta senha?", "Use quando a dica quebrou uma regra. A senha não vale ponto e não volta mais.", "Anular",
        () => { despachar("retomar"); despachar("anular"); },
        true,
        () => despachar("retomar"));
      break;
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
  }
});

// ---------- partida salva ----------

if (estado) {
  if (estado.versao !== 1) { estado = null; gravar(CHAVE_PARTIDA, null); }
  else if (estado.tela === "jogando") despachar("pausar"); // recarregou no meio da rodada: pausa
}
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
