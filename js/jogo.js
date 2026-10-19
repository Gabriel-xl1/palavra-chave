// Motor de regras do Palavra-Chave (adaptado do manual do jogo de tabuleiro).
// Tudo aqui é puro: recebe o estado, devolve um estado novo. Sorteio e relógio vêm em `ctx`,
// para que no modo com vários celulares só o aparelho do anfitrião decida as palavras.

export const RODADAS_INICIAIS = 4;          // por equipe
export const PALAVRAS_POR_RODADA = 5;
export const ACERTOS_BONUS = 5;
export const TENTATIVAS_BONUS = 3;          // no bônus, no máximo 3 dicas por senha
export const NIVEL_GARANTIDO = 2;           // completar o 2º nível (25 mil) garante o valor

export const NIVEIS = [
  { valor: 10000, palavras: 10, dificuldade: ["facil"] },
  { valor: 25000, palavras: 9, dificuldade: ["medio"] },
  { valor: 50000, palavras: 8, dificuldade: ["medio"] },
  { valor: 100000, palavras: 7, dificuldade: ["medio", "dificil"] },
  { valor: 250000, palavras: 6, dificuldade: ["dificil"] },
  { valor: 1000000, palavras: 5, dificuldade: ["dificil"] },
];

export const CONFIG_PADRAO = { tempoInicial: 30, tempoBonus: 90, infantil: false, som: true };

export function formatarValor(v) {
  if (v >= 1000000) return `R$ ${v / 1000000} milhão`;
  return `R$ ${(v / 1000).toLocaleString("pt-BR")} mil`;
}

// ---------- criação ----------

export function novoJogo({ equipes, config }, ctx) {
  const estado = {
    versao: 1,
    config: { ...CONFIG_PADRAO, ...config },
    equipes: equipes.map(e => ({
      nome: e.nome,
      jogadores: [...e.jogadores],
      pontos: 0,
      rodadas: [],
      bonus: { doador: null, niveis: 0, premio: null, motivo: null },
    })),
    primeira: ctx.aleatorio() < 0.5 ? 0 : 1,
    fase: "inicial",
    indiceRodada: 0,
    ordemBonus: null,
    empateInicial: false,
    indiceBonus: 0,
    tela: "passe",
    rodada: null,
  };
  estado.rodada = rodadaInicial(estado, ctx);
  return estado;
}

function rodadaInicial(estado, ctx) {
  const i = estado.indiceRodada;
  const equipe = (estado.primeira + i) % 2;
  const numero = Math.floor(i / 2) + 1;
  const doador = (numero - 1) % 2;           // inverte quem dá a dica a cada rodada
  const dificuldade = estado.config.infantil ? ["facil"] : numero <= 2 ? ["facil"] : ["medio"];
  return {
    fase: "inicial",
    equipe,
    numero,
    doador,
    adivinhador: 1 - doador,
    nivel: null,
    palavras: ctx.sortear(dificuldade, PALAVRAS_POR_RODADA).map(novaPalavra),
    atual: 0,
    fimEm: null,
    restantePausado: null,
    motivo: null,
  };
}

function rodadaBonus(estado, ctx) {
  const equipe = estado.ordemBonus[estado.indiceBonus];
  const eq = estado.equipes[equipe];
  const nivel = eq.bonus.niveis;              // índice do próximo nível a jogar
  const def = NIVEIS[nivel];
  const dificuldade = estado.config.infantil ? ["facil"] : def.dificuldade;
  return {
    fase: "bonus",
    equipe,
    numero: nivel + 1,
    doador: eq.bonus.doador,
    adivinhador: 1 - eq.bonus.doador,
    nivel,
    palavras: ctx.sortear(dificuldade, def.palavras).map(novaPalavra),
    atual: 0,
    fimEm: null,
    restantePausado: null,
    motivo: null,
  };
}

function novaPalavra(texto) {
  // status: pendente | passada | acerto | anulada | perdida
  return { texto, status: "pendente", tentativas: 0, acertou: false };
}

// ---------- consultas ----------

export function tempoDaRodada(estado) {
  return (estado.rodada.fase === "bonus" ? estado.config.tempoBonus : estado.config.tempoInicial) * 1000;
}

export function restante(estado, agora) {
  const r = estado.rodada;
  if (!r) return 0;
  if (r.restantePausado != null) return r.restantePausado;
  if (r.fimEm == null) return tempoDaRodada(estado);
  return Math.max(0, r.fimEm - agora);
}

export function acertos(rodada) {
  return rodada.palavras.filter(p => p.status === "acerto").length;
}

export function premioGarantido(niveis) {
  return niveis >= NIVEL_GARANTIDO ? NIVEIS[NIVEL_GARANTIDO - 1].valor : 0;
}

export function vencedor(estado) {
  const [a, b] = estado.equipes;
  if (a.bonus.premio !== b.bonus.premio) return a.bonus.premio > b.bonus.premio ? 0 : 1;
  if (a.pontos !== b.pontos) return a.pontos > b.pontos ? 0 : 1;
  return null; // empate total
}

// ---------- ações ----------

export function agir(estadoAtual, tipo, dados = {}, ctx) {
  const estado = structuredClone(estadoAtual);
  const r = estado.rodada;
  const agora = ctx.agora;

  switch (tipo) {
    case "comecar":
      if (estado.tela !== "passe") return estadoAtual;
      r.fimEm = agora + tempoDaRodada(estado);
      r.restantePausado = null;
      estado.tela = "jogando";
      return estado;

    case "pausar":
      if (estado.tela !== "jogando" || r.restantePausado != null) return estadoAtual;
      r.restantePausado = Math.max(0, r.fimEm - agora);
      return estado;

    case "retomar":
      if (estado.tela !== "jogando" || r.restantePausado == null) return estadoAtual;
      r.fimEm = agora + r.restantePausado;
      r.restantePausado = null;
      return estado;

    case "acertou":
    case "passar":
    case "errou":
    case "anular": {
      if (estado.tela !== "jogando" || r.restantePausado != null) return estadoAtual;
      const p = r.palavras[r.atual];
      if (tipo === "acertou") { p.status = "acerto"; p.acertou = true; p.tentativas++; }
      else if (tipo === "anular") p.status = "anulada";
      else if (tipo === "passar") p.status = r.fase === "bonus" ? "perdida" : "passada";
      else if (tipo === "errou") {
        if (r.fase !== "bonus") return estadoAtual;
        p.tentativas++;
        if (p.tentativas < TENTATIVAS_BONUS) return estado; // mesma senha, próxima dica
        p.status = "perdida";
      }
      avancar(estado);
      return estado;
    }

    case "tempoEsgotado":
      if (estado.tela !== "jogando" || restante(estado, agora) > 0) return estadoAtual;
      encerrar(estado, "tempo");
      return estado;

    case "alternarConferencia": {
      if (estado.tela !== "conferir") return estadoAtual;
      const p = r.palavras[dados.indice];
      if (!p || !p.acertou) return estadoAtual;
      p.status = p.status === "acerto" ? "anulada" : "acerto";
      return estado;
    }

    case "confirmarConferencia":
      if (estado.tela !== "conferir") return estadoAtual;
      return r.fase === "inicial" ? fecharRodadaInicial(estado, ctx) : fecharNivelBonus(estado);

    case "irParaBonus":
      if (estado.tela !== "placarInicial") return estadoAtual;
      estado.fase = "bonus";
      estado.indiceBonus = 0;
      estado.rodada = null;
      estado.tela = "escolhaDoador";
      return estado;

    case "escolherDoador": {
      if (estado.tela !== "escolhaDoador") return estadoAtual;
      const eq = estado.equipes[estado.ordemBonus[estado.indiceBonus]];
      eq.bonus.doador = dados.jogador;
      estado.tela = "escada";
      return estado;
    }

    case "jogarNivel":
      if (estado.tela !== "escada") return estadoAtual;
      estado.rodada = rodadaBonus(estado, ctx);
      estado.tela = "passe";
      return estado;

    case "parar": {
      if (estado.tela !== "escada") return estadoAtual;
      const eq = estado.equipes[estado.ordemBonus[estado.indiceBonus]];
      if (eq.bonus.niveis === 0) return estadoAtual;
      eq.bonus.premio = NIVEIS[eq.bonus.niveis - 1].valor;
      eq.bonus.motivo = "parou";
      estado.tela = "resultadoBonus";
      return estado;
    }

    case "proximaEquipeBonus":
      if (estado.tela !== "resultadoBonus") return estadoAtual;
      estado.rodada = null;
      if (estado.indiceBonus === 0) {
        estado.indiceBonus = 1;
        estado.tela = "escolhaDoador";
      } else {
        estado.tela = "fim";
      }
      return estado;

    default:
      return estadoAtual;
  }
}

function avancar(estado) {
  const r = estado.rodada;
  const n = r.palavras.length;

  if (r.fase === "bonus") {
    const feitos = acertos(r);
    const pendentes = r.palavras.filter(p => p.status === "pendente").length;
    if (feitos >= ACERTOS_BONUS) return encerrar(estado, "meta");
    if (feitos + pendentes < ACERTOS_BONUS) return encerrar(estado, "impossivel");
    for (let i = r.atual + 1; i < n; i++) {
      if (r.palavras[i].status === "pendente") { r.atual = i; return; }
    }
    return encerrar(estado, "impossivel");
  }

  // Rodadas iniciais: primeiro as que ainda não apareceram, depois volta às passadas.
  for (const alvo of ["pendente", "passada"]) {
    for (let k = 1; k <= n; k++) {
      const i = (r.atual + k) % n;
      if (r.palavras[i].status === alvo) { r.atual = i; return; }
    }
  }
  encerrar(estado, "todas");
}

function encerrar(estado, motivo) {
  const r = estado.rodada;
  r.motivo = motivo;
  r.restantePausado = 0;
  estado.tela = "conferir";
}

function fecharRodadaInicial(estado, ctx) {
  const r = estado.rodada;
  const eq = estado.equipes[r.equipe];
  const pontos = acertos(r);
  eq.pontos += pontos;
  eq.rodadas.push({ numero: r.numero, pontos, palavras: r.palavras.map(p => ({ texto: p.texto, status: p.status })) });
  estado.indiceRodada++;

  if (estado.indiceRodada < RODADAS_INICIAIS * 2) {
    estado.rodada = rodadaInicial(estado, ctx);
    estado.tela = "passe";
    return estado;
  }

  const [a, b] = estado.equipes;
  let primeiro;
  if (a.pontos === b.pontos) {
    estado.empateInicial = true;
    primeiro = ctx.aleatorio() < 0.5 ? 0 : 1;
  } else {
    primeiro = a.pontos > b.pontos ? 0 : 1;
  }
  estado.ordemBonus = [primeiro, 1 - primeiro];
  estado.rodada = null;
  estado.tela = "placarInicial";
  return estado;
}

function fecharNivelBonus(estado) {
  const r = estado.rodada;
  const eq = estado.equipes[r.equipe];
  if (acertos(r) >= ACERTOS_BONUS) {
    eq.bonus.niveis++;
    if (eq.bonus.niveis === NIVEIS.length) {
      eq.bonus.premio = NIVEIS[NIVEIS.length - 1].valor;
      eq.bonus.motivo = "milhao";
      estado.tela = "resultadoBonus";
    } else {
      estado.tela = "escada";
    }
  } else {
    eq.bonus.premio = premioGarantido(eq.bonus.niveis);
    eq.bonus.motivo = "falhou";
    estado.tela = "resultadoBonus";
  }
  return estado;
}
