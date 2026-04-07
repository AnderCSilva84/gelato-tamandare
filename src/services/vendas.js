import {
  addDoc,
  collection,
  deleteDoc,
  doc,
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

export async function addVenda(uid, dados) {
  return addDoc(vendasRef, {
    uid: uid || null,
    produto: String(dados?.produto || "").trim(),
    valor: Number(dados?.valor || 0),
    quantidade: Number(dados?.quantidade || 1),
    atendente: String(dados?.atendente || "").trim(),
    atendenteId: String(dados?.atendenteId || "").trim(),
    atendenteNome: String(dados?.atendenteNome || dados?.atendente || "").trim(),
    data: String(dados?.data || ""),
    criadoEm: serverTimestamp(),
  });
}

export async function updateVenda(id, dados) {
  if (!id) throw new Error("Venda invalida.");
  return updateDoc(doc(db, "vendas", id), cleanData(dados));
}

export async function deleteVenda(id) {
  if (!id) throw new Error("Venda invalida.");
  return deleteDoc(doc(db, "vendas", id));
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

export async function addDespesa(uid, dados) {
  return addDoc(despesasRef, {
    uid: uid || null,
    descricao: String(dados?.descricao || "").trim(),
    valor: Number(dados?.valor || 0),
    data: String(dados?.data || ""),
    criadoEm: serverTimestamp(),
  });
}

export async function updateDespesa(id, dados) {
  if (!id) throw new Error("Despesa invalida.");
  return updateDoc(doc(db, "despesas", id), cleanData(dados));
}

export async function deleteDespesa(id) {
  if (!id) throw new Error("Despesa invalida.");
  return deleteDoc(doc(db, "despesas", id));
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
