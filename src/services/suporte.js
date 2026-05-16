import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

const CONVERSAS_COLLECTION = "conversas";
const MENSAGENS_COLLECTION = "mensagens";
const mensagensCache = new Map();
const ultimaMensagemCache = new Map();

function sanitizeText(texto) {
  return String(texto || "").trim();
}

function formatMessage(snapshot) {
  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

function upsertCache(conversaId, mensagens) {
  mensagensCache.set(conversaId, mensagens);
  ultimaMensagemCache.set(conversaId, mensagens[mensagens.length - 1] || null);
}

function getConversaRef(conversaId) {
  return doc(db, CONVERSAS_COLLECTION, conversaId);
}

function getMensagensRef(conversaId) {
  return collection(getConversaRef(conversaId), MENSAGENS_COLLECTION);
}

export async function enviarMensagemSuporte(usuarioEmail, usuarioUid, usuarioNome, texto) {
  const mensagem = sanitizeText(texto);
  const uid = sanitizeText(usuarioUid);
  const email = sanitizeText(usuarioEmail).toLowerCase() || `${uid}@pdv.local`;
  const nome = sanitizeText(usuarioNome);

  if (!uid) throw new Error("Usuario invalido para abrir suporte.");
  if (!mensagem) throw new Error("Digite uma mensagem antes de enviar.");

  const conversaId = uid;
  const conversaRef = getConversaRef(conversaId);
  const mensagemRef = doc(getMensagensRef(conversaId));
  const criadoEm = serverTimestamp();
  const batch = writeBatch(db);

  batch.set(
    conversaRef,
    {
      usuarioEmail: email,
      usuarioUid: uid,
      usuarioNome: nome || email,
      criadoEm,
      ultimaMensagem: criadoEm,
      ultimaMensagemTexto: mensagem,
      ultimaMensagemRemetente: email,
      ativo: true,
      respondidoPor: null,
      pendenteAdmin: true,
      resolvidaEm: deleteField(),
      atualizadaEm: criadoEm,
    },
    { merge: true }
  );

  batch.set(mensagemRef, {
    remetente: email,
    texto: mensagem,
    timestamp: criadoEm,
    lido: false,
    tipoRemetente: "usuario",
  });

  await batch.commit();

  const novaMensagem = {
    id: mensagemRef.id,
    remetente: email,
    texto: mensagem,
    timestamp: new Date(),
    lido: false,
    tipoRemetente: "usuario",
  };
  const cached = mensagensCache.get(conversaId) || [];
  upsertCache(conversaId, [...cached, novaMensagem]);

  return conversaId;
}

export function escutarConversaSuporte(conversaId, callback, onError) {
  if (!conversaId) {
    callback([]);
    return () => {};
  }

  const cached = mensagensCache.get(conversaId);
  if (cached) {
    callback(cached);
  }

  const mensagensQuery = query(getMensagensRef(conversaId), orderBy("timestamp", "asc"));

  return onSnapshot(
    mensagensQuery,
    (snapshot) => {
      const mensagens = snapshot.docs.map(formatMessage);
      upsertCache(conversaId, mensagens);
      callback(mensagens);
    },
    (error) => {
      if (typeof onError === "function") {
        onError(error);
      }
    }
  );
}

export async function buscarConversasAbertas({ status = "abertas" } = {}) {
  const snapshot = await getDocs(
    query(collection(db, CONVERSAS_COLLECTION), orderBy("ultimaMensagem", "desc"))
  );

  const conversas = snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  }));

  if (status === "abertas") {
    return conversas.filter((item) => item.ativo !== false);
  }

  if (status === "resolvidas") {
    return conversas.filter((item) => item.ativo === false);
  }

  return conversas;
}

export async function responderConversaSuporte(conversaId, mensagem, adminEmail) {
  const texto = sanitizeText(mensagem);
  const email = sanitizeText(adminEmail).toLowerCase();

  if (!conversaId) throw new Error("Conversa invalida.");
  if (!email) throw new Error("Admin invalido para responder.");
  if (!texto) throw new Error("Digite uma resposta antes de enviar.");

  const conversaRef = getConversaRef(conversaId);
  const mensagemRef = doc(getMensagensRef(conversaId));
  const enviadoEm = serverTimestamp();
  const batch = writeBatch(db);

  batch.update(conversaRef, {
    ultimaMensagem: enviadoEm,
    ultimaMensagemTexto: texto,
    ultimaMensagemRemetente: "admin",
    respondidoPor: email,
    ativo: true,
    pendenteAdmin: false,
    resolvidaEm: deleteField(),
    atualizadaEm: enviadoEm,
  });

  batch.set(mensagemRef, {
    remetente: "admin",
    adminEmail: email,
    texto,
    timestamp: enviadoEm,
    lido: true,
    tipoRemetente: "admin",
  });

  await batch.commit();

  const novaMensagem = {
    id: mensagemRef.id,
    remetente: "admin",
    adminEmail: email,
    texto,
    timestamp: new Date(),
    lido: true,
    tipoRemetente: "admin",
  };
  const cached = mensagensCache.get(conversaId) || [];
  upsertCache(conversaId, [...cached, novaMensagem]);
}

export async function fecharConversaSuporte(conversaId) {
  if (!conversaId) throw new Error("Conversa invalida.");

  await updateDoc(getConversaRef(conversaId), {
    ativo: false,
    pendenteAdmin: false,
    resolvidaEm: serverTimestamp(),
    atualizadaEm: serverTimestamp(),
  });
}

export async function obterUltimaMensagem(conversaId) {
  if (!conversaId) return null;

  if (ultimaMensagemCache.has(conversaId)) {
    return ultimaMensagemCache.get(conversaId);
  }

  const cachedMessages = mensagensCache.get(conversaId);
  if (cachedMessages?.length) {
    const ultima = cachedMessages[cachedMessages.length - 1];
    ultimaMensagemCache.set(conversaId, ultima);
    return ultima;
  }

  const snapshot = await getDocs(
    query(getMensagensRef(conversaId), orderBy("timestamp", "desc"), limit(1))
  );

  const ultimaMensagem = snapshot.empty ? null : formatMessage(snapshot.docs[0]);
  ultimaMensagemCache.set(conversaId, ultimaMensagem);
  return ultimaMensagem;
}

export async function obterConversaSuporte(conversaId) {
  if (!conversaId) return null;

  const snapshot = await getDoc(getConversaRef(conversaId));
  if (!snapshot.exists()) return null;

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}
