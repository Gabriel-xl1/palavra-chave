// Salas online do modo "cada um no seu celular" (Firebase Realtime Database).
// O celular de quem cria a sala (anfitrião) é o único que aplica as regras e grava o estado;
// os outros só mandam pedidos. Este arquivo só é carregado quando alguém entra nesse modo.
//
// salas/<CÓDIGO>/
//   anfitriao: uid
//   criadaEm, lobby: { fase: "lobby" | "jogo", equipes: [{ nome }], config }
//   jogadores/<uid>: { nome, equipe (0, 1 ou -1 = plateia), em, online }
//   estado: JSON do motor (texto, para o banco não descartar listas vazias)
//   pedidos/<id>: { uid, tipo, dados, seq, em }

const FIREBASE = {
  apiKey: "AIzaSyDvFnAaMxIRoFn2QEHlDgmKu_2PDR3w2rM",
  authDomain: "palavra-chave-e8ecf.firebaseapp.com",
  databaseURL: "https://palavra-chave-e8ecf-default-rtdb.firebaseio.com",
  projectId: "palavra-chave-e8ecf",
  storageBucket: "palavra-chave-e8ecf.firebasestorage.app",
  messagingSenderId: "657012494917",
  appId: "1:657012494917:web:10be36f84b30f0f9c1492c",
};
const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O e 1/I, que se confundem

let fb = null;
let deslocamento = 0;
let conectado = true;
const ouvintesConexao = new Set();

export async function conectar() {
  if (fb) return fb;
  const [appMod, authMod, db] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-database.js`),
  ]);
  const app = appMod.initializeApp(FIREBASE);
  const auth = authMod.getAuth(app);
  const usuario = await new Promise((ok, erro) => {
    const parar = authMod.onAuthStateChanged(auth, u => {
      if (u) { parar(); ok(u); }
      else authMod.signInAnonymously(auth).catch(e => { parar(); erro(e); });
    });
  });
  const banco = db.getDatabase(app);
  db.onValue(db.ref(banco, ".info/serverTimeOffset"), s => { deslocamento = s.val() || 0; });
  db.onValue(db.ref(banco, ".info/connected"), s => {
    conectado = !!s.val();
    ouvintesConexao.forEach(f => f(conectado));
  });
  fb = { db, banco, uid: usuario.uid };
  return fb;
}

export function meuUid() { return fb?.uid; }
export function agora() { return Date.now() + deslocamento; }
export function online() { return conectado; }
export function aoMudarConexao(f) { ouvintesConexao.add(f); return () => ouvintesConexao.delete(f); }

function ref(caminho) { return fb.db.ref(fb.banco, caminho); }

export function normalizarCodigo(c) {
  return String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

function codigoAleatorio() {
  return Array.from({ length: 4 }, () => LETRAS[Math.floor(Math.random() * LETRAS.length)]).join("");
}

export async function criarSala(nome, config) {
  await conectar();
  const { db } = fb;
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    const codigo = codigoAleatorio();
    try {
      // só grava se o código estiver livre (as regras recusam sala de outra pessoa)
      await db.set(ref(`salas/${codigo}/anfitriao`), fb.uid);
    } catch { continue; }
    await db.update(ref(`salas/${codigo}`), {
      criadaEm: db.serverTimestamp(),
      lobby: { fase: "lobby", equipes: [{ nome: "Equipe Azul" }, { nome: "Equipe Laranja" }], config },
      estado: null,
      pedidos: null,
      [`jogadores/${fb.uid}`]: { nome, equipe: null, em: db.serverTimestamp(), online: true },
    });
    marcarPresenca(codigo);
    return codigo;
  }
  throw new Error("Não consegui criar a sala. Tente de novo.");
}

export async function entrarSala(codigo, nome) {
  await conectar();
  const { db } = fb;
  const dono = await db.get(ref(`salas/${codigo}/anfitriao`));
  if (!dono.exists()) throw new Error("Sala não encontrada. Confira o código.");
  const eu = await db.get(ref(`salas/${codigo}/jogadores/${fb.uid}`));
  if (eu.exists()) {
    await db.update(ref(`salas/${codigo}/jogadores/${fb.uid}`), { nome, online: true });
  } else {
    await db.set(ref(`salas/${codigo}/jogadores/${fb.uid}`), { nome, equipe: null, em: db.serverTimestamp(), online: true });
  }
  marcarPresenca(codigo);
}

let presenca = null;
function marcarPresenca(codigo) {
  const { db } = fb;
  presenca?.();
  const meu = ref(`salas/${codigo}/jogadores/${fb.uid}/online`);
  presenca = db.onValue(ref(".info/connected"), s => {
    if (!s.val()) return;
    db.onDisconnect(meu).set(false).then(() => db.set(meu, true)).catch(() => {});
  });
}

export function ouvirSala(codigo, aoMudar) {
  const { db } = fb;
  return db.onValue(ref(`salas/${codigo}`), s => {
    const sala = s.val();
    if (sala && typeof sala.estado === "string") {
      try { sala.estado = JSON.parse(sala.estado); } catch { sala.estado = null; }
    }
    aoMudar(sala);
  }, () => aoMudar(null));
}

export function escolherEquipe(codigo, uid, equipe) {
  return fb.db.update(ref(`salas/${codigo}/jogadores/${uid}`), { equipe });
}

export function atualizarLobby(codigo, campos) {
  return fb.db.update(ref(`salas/${codigo}/lobby`), campos);
}

export function gravarEstado(codigo, estado, fase = "jogo") {
  return fb.db.update(ref(`salas/${codigo}`), {
    estado: estado ? JSON.stringify(estado) : null,
    "lobby/fase": fase,
  });
}

export function enviarPedido(codigo, tipo, dados, seq) {
  const { db } = fb;
  return db.push(ref(`salas/${codigo}/pedidos`), { uid: fb.uid, tipo, dados: dados || {}, seq: seq ?? 0, em: db.serverTimestamp() });
}

// Só o anfitrião: recebe cada pedido uma vez, em ordem, e apaga depois de tratar.
export function atenderPedidos(codigo, tratar) {
  const { db } = fb;
  let fila = Promise.resolve();
  return db.onChildAdded(ref(`salas/${codigo}/pedidos`), s => {
    const pedido = s.val();
    fila = fila
      .then(() => tratar(pedido))
      .catch(e => console.error("pedido", e))
      .then(() => db.remove(s.ref).catch(() => {}));
  });
}

export async function sairSala(codigo, apagarJogador) {
  if (!fb) return;
  const { db } = fb;
  presenca?.();
  presenca = null;
  const meu = ref(`salas/${codigo}/jogadores/${fb.uid}`);
  await db.onDisconnect(meu).cancel().catch(() => {});
  if (apagarJogador) await db.remove(meu).catch(() => {});
  else await db.update(meu, { online: false }).catch(() => {});
}

export function encerrarSala(codigo) {
  return fb.db.remove(ref(`salas/${codigo}`));
}
