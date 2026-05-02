import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

const vendasRef = collection(db, "vendas");
const despesasRef = collection(db, "despesas");

function cleanData(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

function rangeQuery(ref, dataInicio, dataFim) {
  return query(ref, where("data", ">=", dataInicio), where("data", "<=", dataFim));
}

function dayQuery(ref, data) {
  return query(ref, where("data", "==", data));
}

function sortByDateAndId(items) {
  return [...items].sort((a, b) => {
    const dataA = String(a?.data || "");
    const dataB = String(b?.data || "");
    const byDate = dataB.localeCompare(dataA);
    if (byDate !== 0) return byDate;

    const idA = String(a?.id || "");
    const idB = String(b?.id || "");
    return idB.localeCompare(idA);
  });
}

function resumoRef(dataKey) {
  return doc(db, "resumo_diario", dataKey);
}

function rankingRef(dataKey) {
  return doc(db, "ranking_diario", dataKey);
}

async function ensureDailyDocs(dataKey) {
  await setDoc(
    resumoRef(dataKey),
    {
      totalVendas: 0,
      totalDespesas: 0,
      lucro: 0,
      totalItens: 0,
    },
    { merge: true }
  );

  await setDoc(
    rankingRef(dataKey),
    {
      atendentes: {},
    },
    { merge: true }
  );
}

async function applyVendaAggregation(venda, multiplier = 1) {
  const dataKey = String(venda?.data || "");
  if (!dataKey) return;

  const valor = Number(venda?.valor || 0) * multiplier;
  const quantidade = Number(venda?.quantidade || 0) * multiplier;
  const atendenteId = String(venda?.atendenteId || venda?.atendente || "");
  const atendenteNome = String(venda?.atendenteNome || venda?.atendente || "");

  await ensureDailyDocs(dataKey);
  await updateDoc(resumoRef(dataKey), {
    totalVendas: increment(valor),
    lucro: increment(valor),
    totalItens: increment(quantidade),
  });

  if (atendenteId) {
    await updateDoc(rankingRef(dataKey), {
      [`atendentes.${atendenteId}.nome`]: atendenteNome,
      [`atendentes.${atendenteId}.total`]: increment(valor),
    });
  }
}

async function applyDespesaAggregation(despesa, multiplier = 1) {
  const dataKey = String(despesa?.data || "");
  if (!dataKey) return;

  const valor = Number(despesa?.valor || 0) * multiplier;

  await ensureDailyDocs(dataKey);
  await updateDoc(resumoRef(dataKey), {
    totalDespesas: increment(valor),
    lucro: increment(-valor),
  });
}

export async function addVenda(uid, dados) {
  const venda = {
    uid: uid || null,
    produto: String(dados?.produto || "").trim(),
    valor: Number(dados?.valor || 0),
    quantidade: Number(dados?.quantidade || 1),
    atendente: String(dados?.atendente || "").trim(),
    atendenteId: String(dados?.atendenteId || "").trim(),
    atendenteNome: String(dados?.atendenteNome || dados?.atendente || "").trim(),
    caixaId: String(dados?.caixaId || "").trim(),
    formaPagamento: String(dados?.formaPagamento || "").trim(),
    valorRecebido: Number(dados?.valorRecebido || 0),
    troco: Number(dados?.troco || 0),
    data: String(dados?.data || ""),
    criadoEm: serverTimestamp(),
  };

  const result = await addDoc(vendasRef, venda);
  await applyVendaAggregation(venda, 1);
  return result;
}

export async function updateVenda(id, dados) {
  if (!id) throw new Error("Venda invalida.");

  const ref = doc(db, "vendas", id);
  const currentSnapshot = await getDoc(ref);
  if (!currentSnapshot.exists()) throw new Error("Venda nao encontrada.");

  const current = currentSnapshot.data();
  const next = cleanData({
    ...current,
    ...dados,
    valor: dados?.valor !== undefined ? Number(dados.valor) : current.valor,
    quantidade: dados?.quantidade !== undefined ? Number(dados.quantidade) : current.quantidade,
    atendenteId:
      dados?.atendenteId !== undefined ? String(dados.atendenteId) : current.atendenteId,
    atendenteNome:
      dados?.atendenteNome !== undefined
        ? String(dados.atendenteNome)
        : dados?.atendente !== undefined
          ? String(dados.atendente)
          : current.atendenteNome || current.atendente,
    atendente:
      dados?.atendente !== undefined ? String(dados.atendente) : current.atendente,
    formaPagamento:
      dados?.formaPagamento !== undefined
        ? String(dados.formaPagamento)
        : current.formaPagamento,
    data: dados?.data !== undefined ? String(dados.data) : current.data,
  });

  await applyVendaAggregation(current, -1);
  await updateDoc(ref, cleanData(dados));
  await applyVendaAggregation(next, 1);
}

export async function deleteVenda(id) {
  if (!id) throw new Error("Venda invalida.");

  const ref = doc(db, "vendas", id);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return;

  await applyVendaAggregation(snapshot.data(), -1);
  return deleteDoc(ref);
}

export async function getVendas(uid, dataInicio, dataFim = dataInicio) {
  if (!dataInicio) return [];
  const snapshot = await getDocs(rangeQuery(vendasRef, dataInicio, dataFim));
  return sortByDateAndId(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
}

export function subscribeVendasDoDia(uid, data, callback) {
  if (!data) {
    callback([]);
    return () => {};
  }

  return onSnapshot(dayQuery(vendasRef, data), (snapshot) => {
    callback(sortByDateAndId(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))));
  });
}

export function subscribeVendasPorCaixa(caixaId, callback) {
  if (!caixaId) {
    callback([]);
    return () => {};
  }

  return onSnapshot(query(vendasRef, where("caixaId", "==", caixaId)), (snapshot) => {
    callback(sortByDateAndId(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))));
  });
}

export async function getVendasPorCaixa(caixaId) {
  if (!caixaId) return [];
  const snapshot = await getDocs(query(vendasRef, where("caixaId", "==", caixaId)));
  return sortByDateAndId(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
}

export async function addDespesa(uid, dados) {
  const despesa = {
    uid: uid || null,
    descricao: String(dados?.descricao || "").trim(),
    valor: Number(dados?.valor || 0),
    data: String(dados?.data || ""),
    criadoEm: serverTimestamp(),
  };

  const result = await addDoc(despesasRef, despesa);
  await applyDespesaAggregation(despesa, 1);
  return result;
}

export async function updateDespesa(id, dados) {
  if (!id) throw new Error("Despesa invalida.");

  const ref = doc(db, "despesas", id);
  const currentSnapshot = await getDoc(ref);
  if (!currentSnapshot.exists()) throw new Error("Despesa nao encontrada.");

  const current = currentSnapshot.data();
  const next = cleanData({
    ...current,
    ...dados,
    valor: dados?.valor !== undefined ? Number(dados.valor) : current.valor,
    data: dados?.data !== undefined ? String(dados.data) : current.data,
  });

  await applyDespesaAggregation(current, -1);
  await updateDoc(ref, cleanData(dados));
  await applyDespesaAggregation(next, 1);
}

export async function deleteDespesa(id) {
  if (!id) throw new Error("Despesa invalida.");

  const ref = doc(db, "despesas", id);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return;

  await applyDespesaAggregation(snapshot.data(), -1);
  return deleteDoc(ref);
}

export async function getDespesas(uid, dataInicio, dataFim = dataInicio) {
  if (!dataInicio) return [];
  const snapshot = await getDocs(rangeQuery(despesasRef, dataInicio, dataFim));
  return sortByDateAndId(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
}

export function subscribeDespesasDoDia(uid, data, callback) {
  if (!data) {
    callback([]);
    return () => {};
  }

  return onSnapshot(dayQuery(despesasRef, data), (snapshot) => {
    callback(sortByDateAndId(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))));
  });
}

export async function getResumoDiario(dataKey) {
  if (!dataKey) return null;
  const snapshot = await getDoc(resumoRef(dataKey));
  return snapshot.exists() ? snapshot.data() : null;
}

export function subscribeResumoDiario(dataKey, callback) {
  if (!dataKey) {
    callback(null);
    return () => {};
  }

  return onSnapshot(resumoRef(dataKey), (snapshot) => {
    callback(snapshot.exists() ? snapshot.data() : null);
  });
}

export async function getRankingDiario(dataKey) {
  if (!dataKey) return null;
  const snapshot = await getDoc(rankingRef(dataKey));
  return snapshot.exists() ? snapshot.data() : null;
}

export function subscribeRankingDiario(dataKey, callback) {
  if (!dataKey) {
    callback(null);
    return () => {};
  }

  return onSnapshot(rankingRef(dataKey), (snapshot) => {
    callback(snapshot.exists() ? snapshot.data() : null);
  });
}
