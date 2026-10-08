import { executarOperacao, operacaoPersistente } from "./operacoes";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

const vendasRef = collection(db, "vendas");
const despesasRef = collection(db, "despesas");
const despesasFixasRef = collection(db, "despesas_fixas");
const entradasConsolidadasRef = collection(db, "entradas_consolidadas");

function cleanData(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

function rangeQuery(ref, uid, inicio, fim = inicio) {
  return query(ref, where("uid", "==", uid), where("data", ">=", inicio), where("data", "<=", fim));
}

function dayQuery(ref, uid, data) {
  return query(ref, where("uid", "==", uid), where("data", "==", data));
}

function filterPeriod(items, dataInicio, dataFim = dataInicio) {
  return items.filter((item) => String(item?.data || "") >= dataInicio && String(item?.data || "") <= dataFim);
}


function getItemTimestamp(item) {
  const registradoEmMs = Number(item?.registradoEmMs || 0);
  if (Number.isFinite(registradoEmMs) && registradoEmMs > 0) {
    return registradoEmMs;
  }

  if (typeof item?.criadoEm?.toDate === "function") {
    return item.criadoEm.toDate().getTime();
  }

  if (item?.criadoEm instanceof Date) {
    return item.criadoEm.getTime();
  }

  if (typeof item?.criadoEm === "string") {
    const parsed = new Date(item.criadoEm).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }

  return 0;
}

function sortByDateAndId(items) {
  return items.filter(item => item.status !== "cancelada").sort((a, b) => {
    const dataA = String(a?.data || "");
    const dataB = String(b?.data || "");
    const byDate = dataB.localeCompare(dataA);
    if (byDate !== 0) return byDate;

    const timeA = getItemTimestamp(a);
    const timeB = getItemTimestamp(b);
    if (timeA !== timeB) return timeB - timeA;

    const idA = String(a?.id || "");
    const idB = String(b?.id || "");
    return idB.localeCompare(idA);
  });
}

function sortByDescricao(items) {
  return [...items].sort((a, b) =>
    String(a?.descricao || "").localeCompare(String(b?.descricao || ""), "pt-BR", {
      sensitivity: "base",
    })
  );
}

function resumoRef(uid, data) { return doc(db, 'resumo_diario', uid + '__' + data); }
function rankingRef(uid, data) { return doc(db, 'ranking_diario', uid + '__' + data); }

export async function deleteVenda(id, motivo) {
  return executarOperacao('cancelarVenda', { id, motivo });
}

export async function getVendas(uid, dataInicio, dataFim = dataInicio) {
  if (!dataInicio) return [];
  const snapshot = await getDocs(rangeQuery(vendasRef, uid, dataInicio, dataFim));
  return sortByDateAndId(filterPeriod(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })), dataInicio, dataFim));
}

export function subscribeVendasDoDia(uid, data, callback) {
  if (!data) {
    callback([]);
    return () => {};
  }

  return onSnapshot(dayQuery(vendasRef, uid, data), (snapshot) => {
    callback(sortByDateAndId(filterPeriod(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })), data, data)));
  });
}

export function subscribeVendasPeriodo(uid, dataInicio, dataFim, callback) {
  if (!dataInicio || !dataFim) {
    callback([]);
    return () => {};
  }

  return onSnapshot(rangeQuery(vendasRef, uid, dataInicio, dataFim), (snapshot) => {
    callback(sortByDateAndId(filterPeriod(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })), dataInicio, dataFim)));
  });
}

export function subscribeVendasPorCaixa(uid, caixaId, callback) {
  if (!uid || !caixaId) {
    callback([]);
    return () => {};
  }

  return onSnapshot(query(vendasRef, where("uid", "==", uid), where("caixaId", "==", caixaId)), (snapshot) => {
    callback(sortByDateAndId(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.caixaId === caixaId)));
  });
}

export async function getVendasPorCaixa(uid, caixaId) {
  if (!uid || !caixaId) return [];
  const snapshot = await getDocs(query(vendasRef, where("uid", "==", uid)));
  return sortByDateAndId(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.caixaId === caixaId));
}

export async function addDespesa(uid, dados) { return operacaoPersistente('criarDespesa', uid, { uid, id: crypto.randomUUID(), ...dados }); }

export async function updateDespesa(id, dados) { return executarOperacao('editarDespesa', { id, ...dados }); }

export async function deleteDespesa(id) { return executarOperacao('cancelarDespesa', { id }); }

export async function getDespesas(uid, dataInicio, dataFim = dataInicio) {
  if (!dataInicio) return [];
  const snapshot = await getDocs(rangeQuery(despesasRef, uid, dataInicio, dataFim));
  return sortByDateAndId(filterPeriod(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })), dataInicio, dataFim));
}

export function subscribeDespesasDoDia(uid, data, callback) {
  if (!data) {
    callback([]);
    return () => {};
  }

  return onSnapshot(dayQuery(despesasRef, uid, data), (snapshot) => {
    callback(sortByDateAndId(filterPeriod(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })), data, data)));
  });
}

function normalizarDespesaFixa(dados = {}) {
  return {
    descricao: String(dados?.descricao || "").trim(),
    valorPadrao:
      dados?.valorPadrao === "" || dados?.valorPadrao === undefined || dados?.valorPadrao === null
        ? null
        : Number(dados.valorPadrao || 0),
    ativa: dados?.ativa !== false,
  };
}

export async function addDespesaFixa(uid, dados) {
  const despesaFixa = {
    ...normalizarDespesaFixa(dados),
    uid,
    criadoEm: serverTimestamp(),
  };

  return addDoc(despesasFixasRef, despesaFixa);
}

export async function updateDespesaFixa(id, dados) {
  if (!id) throw new Error("Despesa fixa invalida.");

  const ref = doc(db, "despesas_fixas", id);
  const currentSnapshot = await getDoc(ref);
  if (!currentSnapshot.exists()) throw new Error("Despesa fixa nao encontrada.");

  const current = currentSnapshot.data();
  const next = normalizarDespesaFixa({
    ...current,
    ...dados,
  });

  await updateDoc(ref, cleanData(next));
}

export async function deleteDespesaFixa(id) {
  if (!id) throw new Error("Despesa fixa invalida.");
  return deleteDoc(doc(db, "despesas_fixas", id));
}

export async function getDespesasFixas(uid) {
  const snapshot = await getDocs(query(despesasFixasRef, where("uid", "==", uid)));
  return sortByDescricao(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
}

export async function addEntradaConsolidada(uid, dados) { return operacaoPersistente('criarEntrada', uid, { uid, id: crypto.randomUUID(), ...dados }); }
export async function updateEntradaConsolidada(id, dados) { return executarOperacao('editarEntrada', { id, ...dados }); }
export async function deleteEntradaConsolidada(id) { return executarOperacao('cancelarEntrada', { id }); }

export async function getEntradasConsolidadas(uid, dataInicio, dataFim = dataInicio) {
  if (!dataInicio) return [];
  try {
    const snapshot = await getDocs(rangeQuery(entradasConsolidadasRef, uid, dataInicio, dataFim));
    return sortByDateAndId(filterPeriod(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })), dataInicio, dataFim));
  } catch (error) {
    console.error("Erro ao carregar entradas consolidadas:", error);
    return [];
  }
}

export function subscribeEntradasConsolidadasDoDia(uid, data, callback, onError) {
  if (!data) {
    callback([]);
    return () => {};
  }

  return onSnapshot(
    dayQuery(entradasConsolidadasRef, uid, data),
    (snapshot) => {
      callback(sortByDateAndId(filterPeriod(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })), data, data)));
    },
    (error) => {
      console.error("Erro ao ouvir entradas consolidadas do dia:", error);
      callback([]);
      if (typeof onError === "function") onError(error);
    }
  );
}

export async function getResumoDiario(uid, dataKey) {
  if (!dataKey) return null;
  const snapshot = await getDoc(resumoRef(uid, dataKey));
  return snapshot.exists() ? snapshot.data() : null;
}

export function subscribeResumoDiario(uid, dataKey, callback) {
  if (!dataKey) {
    callback(null);
    return () => {};
  }

  return onSnapshot(resumoRef(uid, dataKey), (snapshot) => {
    callback(snapshot.exists() ? snapshot.data() : null);
  });
}

export async function getRankingDiario(uid, dataKey) {
  if (!dataKey) return null;
  const snapshot = await getDoc(rankingRef(uid, dataKey));
  return snapshot.exists() ? snapshot.data() : null;
}

export function subscribeRankingDiario(uid, dataKey, callback) {
  if (!dataKey) {
    callback(null);
    return () => {};
  }

  return onSnapshot(rankingRef(uid, dataKey), (snapshot) => {
    callback(snapshot.exists() ? snapshot.data() : null);
  });
}
