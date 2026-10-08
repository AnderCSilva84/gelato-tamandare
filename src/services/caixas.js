import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { executarOperacao, operacaoPersistente } from "./operacoes";


const caixasRef = collection(db, "caixas");
const retiradasRef = collection(db, "retiradas_caixa");

function rangeQuery(uid, inicio, fim = inicio) {
  return query(caixasRef, where("uid", "==", uid), where("data", ">=", inicio), where("data", "<=", fim));
}

function filterPeriod(items, dataInicio, dataFim = dataInicio) {
  return items.filter((item) => String(item?.data || "") >= dataInicio && String(item?.data || "") <= dataFim);
}

function retiradaDayQuery(data) {
  return query(retiradasRef, where("data", "==", data));
}

function sortByDateAndStatus(items) {
  return items.filter(item => item.status !== "arquivado" && item.status !== "cancelada").sort((a, b) => {
    const dataA = String(a?.data || "");
    const dataB = String(b?.data || "");
    const byDate = dataB.localeCompare(dataA);
    if (byDate !== 0) return byDate;

    if (a?.status === b?.status) return 0;
    return a?.status === "aberto" ? -1 : 1;
  });
}

export async function abrirCaixa(uid, dados) {
  return operacaoPersistente('abrirCaixa', uid + ':' + dados.atendenteId, { uid, ...dados });
}

export async function fecharCaixa(id, dados) {
  return executarOperacao('fecharCaixa', { caixaId: id, dinheiroContado: dados?.dinheiroContado ?? null });
}

export async function getCaixa(id) {
  if (!id) return null;
  const snapshot = await getDoc(doc(db, "caixas", id));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export function subscribeCaixa(id, callback) {
  if (!id) {
    callback(null);
    return () => {};
  }

  return onSnapshot(doc(db, "caixas", id), (snapshot) => {
    callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
  });
}

export async function getCaixas(uid, dataInicio, dataFim = dataInicio) {
  if (!dataInicio) return [];
  const snapshot = await getDocs(rangeQuery(uid, dataInicio, dataFim));
  return sortByDateAndStatus(filterPeriod(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })), dataInicio, dataFim));
}

export function subscribeCaixasPeriodo(uid, dataInicio, dataFim, callback) {
  if (!dataInicio || !dataFim) {
    callback([]);
    return () => {};
  }

  return onSnapshot(rangeQuery(uid, dataInicio, dataFim), (snapshot) => {
    callback(sortByDateAndStatus(filterPeriod(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })), dataInicio, dataFim)));
  });
}

export function subscribeCaixasAbertos(uid, callback, onError) {
  return onSnapshot(
    query(caixasRef, where("uid", "==", uid), where("status", "==", "aberto")),
    (snapshot) => {
      callback(sortByDateAndStatus(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.status === "aberto")));
    },
    (error) => {
      console.error("Erro ao ouvir caixas abertos:", error);
      callback([]);
      if (typeof onError === "function") onError(error);
    }
  );
}

export async function getCaixasAbertos(uid) {
  const snapshot = await getDocs(query(caixasRef, where("uid", "==", uid)));
  return sortByDateAndStatus(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.status === "aberto"));
}

export async function updateCaixaData(id, data) {
  return executarOperacao('dataCaixa', { caixaId: id, data });
}

export async function getRetiradas(uid, dataInicio, dataFim = dataInicio) {
  if (!dataInicio) return [];
  const snapshot = await getDocs(query(retiradasRef, where("uid", "==", uid), where("data", ">=", dataInicio), where("data", "<=", dataFim)));
  return sortByCreatedAt(filterPeriod(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })), dataInicio, dataFim));
}

export async function deleteCaixa(id) {
  return executarOperacao('arquivarCaixa', { caixaId: id });
}

function sortByCreatedAt(items) {
  return items.filter(item => item.status !== "cancelada").sort((a, b) => {
    const dateA =
      typeof a?.criadoEm?.toDate === "function" ? a.criadoEm.toDate().getTime() : 0;
    const dateB =
      typeof b?.criadoEm?.toDate === "function" ? b.criadoEm.toDate().getTime() : 0;
    if (dateA !== dateB) return dateB - dateA;
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  });
}

export async function addRetiradaCaixa(uid, dados) {
  return operacaoPersistente('retirarCaixa', dados.caixaId, { uid, ...dados });
}

export async function updateRetiradaCaixa(id, dados) {
  return executarOperacao('editarRetirada', { id, ...dados });
}

export async function deleteRetiradaCaixa(id) {
  return executarOperacao('cancelarRetirada', { id });
}

export function subscribeRetiradasCaixa(uid, caixaId, callback, onError) {
  if (!uid || !caixaId) {
    callback([]);
    return () => {};
  }

  return onSnapshot(
    query(retiradasRef, where("uid", "==", uid), where("caixaId", "==", caixaId)),
    (snapshot) => {
      callback(sortByCreatedAt(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.caixaId === caixaId)));
    },
    (error) => {
      console.error("Erro ao ouvir retiradas do caixa:", error);
      callback([]);
      if (typeof onError === "function") onError(error);
    }
  );
}

export function subscribeRetiradasDoDia(data, callback, onError) {
  if (!data) {
    callback([]);
    return () => {};
  }

  return onSnapshot(
    retiradaDayQuery(data),
    (snapshot) => {
      callback(sortByCreatedAt(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))));
    },
    (error) => {
      console.error("Erro ao ouvir retiradas do dia:", error);
      callback([]);
      if (typeof onError === "function") onError(error);
    }
  );
}
