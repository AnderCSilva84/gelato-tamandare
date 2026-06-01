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
const despesasFixasRef = collection(db, "despesas_fixas");
const entradasConsolidadasRef = collection(db, "entradas_consolidadas");

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

function getCurrentTimeLabel() {
  return new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
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
  return [...items].sort((a, b) => {
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
    produtoId: String(dados?.produtoId || "").trim(),
    valor: Number(dados?.valor || 0),
    quantidade: Number(dados?.quantidade || 1),
    unidadeVenda: String(dados?.unidadeVenda || "un").trim() || "un",
    valorUnitario: Number(dados?.valorUnitario || 0),
    atendente: String(dados?.atendente || "").trim(),
    atendenteId: String(dados?.atendenteId || "").trim(),
    atendenteNome: String(dados?.atendenteNome || dados?.atendente || "").trim(),
    caixaId: String(dados?.caixaId || "").trim(),
    formaPagamento: String(dados?.formaPagamento || "").trim(),
    valorRecebido: Number(dados?.valorRecebido || 0),
    troco: Number(dados?.troco || 0),
    data: String(dados?.data || ""),
    horario: String(dados?.horario || getCurrentTimeLabel()).trim(),
    registradoEmMs: Number(dados?.registradoEmMs || Date.now()),
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
    unidadeVenda:
      dados?.unidadeVenda !== undefined ? String(dados.unidadeVenda) : current.unidadeVenda,
    valorUnitario:
      dados?.valorUnitario !== undefined ? Number(dados.valorUnitario) : current.valorUnitario,
    produtoId: dados?.produtoId !== undefined ? String(dados.produtoId) : current.produtoId,
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

export function subscribeVendasPeriodo(uid, dataInicio, dataFim, callback) {
  if (!dataInicio || !dataFim) {
    callback([]);
    return () => {};
  }

  return onSnapshot(rangeQuery(vendasRef, dataInicio, dataFim), (snapshot) => {
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
    observacao: String(dados?.observacao || "").trim(),
    valor: Number(dados?.valor || 0),
    data: String(dados?.data || ""),
    despesaFixaId: String(dados?.despesaFixaId || "").trim(),
    despesaFixaDescricao: String(dados?.despesaFixaDescricao || "").trim(),
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
    descricao: dados?.descricao !== undefined ? String(dados.descricao).trim() : current.descricao,
    observacao:
      dados?.observacao !== undefined ? String(dados.observacao).trim() : current.observacao,
    valor: dados?.valor !== undefined ? Number(dados.valor) : current.valor,
    data: dados?.data !== undefined ? String(dados.data) : current.data,
    despesaFixaId:
      dados?.despesaFixaId !== undefined ? String(dados.despesaFixaId).trim() : current.despesaFixaId,
    despesaFixaDescricao:
      dados?.despesaFixaDescricao !== undefined
        ? String(dados.despesaFixaDescricao).trim()
        : current.despesaFixaDescricao,
  });

  await applyDespesaAggregation(current, -1);
  await updateDoc(
    ref,
    cleanData({
      descricao: next.descricao,
      observacao: next.observacao || "",
      valor: next.valor,
      data: next.data,
      despesaFixaId: next.despesaFixaId || "",
      despesaFixaDescricao: next.despesaFixaDescricao || "",
    })
  );
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

export async function addDespesaFixa(dados) {
  const despesaFixa = {
    ...normalizarDespesaFixa(dados),
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

export async function getDespesasFixas() {
  const snapshot = await getDocs(despesasFixasRef);
  return sortByDescricao(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
}

function normalizarEntradaConsolidada(dados = {}) {
  const dinheiro = Number(dados?.dinheiro || 0);
  const pix = Number(dados?.pix || 0);
  const cartao = Number(dados?.cartao || 0);

  return {
    uid: dados?.uid ?? null,
    data: String(dados?.data || "").trim(),
    dinheiro,
    pix,
    cartao,
    total: dinheiro + pix + cartao,
  };
}

export async function addEntradaConsolidada(uid, dados) {
  const entrada = {
    ...normalizarEntradaConsolidada({ ...dados, uid }),
    criadoEm: serverTimestamp(),
  };

  return addDoc(entradasConsolidadasRef, entrada);
}

export async function updateEntradaConsolidada(id, dados) {
  if (!id) throw new Error("Entrada consolidada invalida.");

  const ref = doc(db, "entradas_consolidadas", id);
  const currentSnapshot = await getDoc(ref);
  if (!currentSnapshot.exists()) throw new Error("Entrada consolidada nao encontrada.");

  const current = currentSnapshot.data();
  const next = normalizarEntradaConsolidada({
    ...current,
    ...dados,
    uid: current.uid ?? null,
  });

  await updateDoc(
    ref,
    cleanData({
      data: next.data,
      dinheiro: next.dinheiro,
      pix: next.pix,
      cartao: next.cartao,
      total: next.total,
    })
  );
}

export async function deleteEntradaConsolidada(id) {
  if (!id) throw new Error("Entrada consolidada invalida.");
  return deleteDoc(doc(db, "entradas_consolidadas", id));
}

export async function getEntradasConsolidadas(uid, dataInicio, dataFim = dataInicio) {
  if (!dataInicio) return [];
  try {
    const snapshot = await getDocs(rangeQuery(entradasConsolidadasRef, dataInicio, dataFim));
    return sortByDateAndId(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
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
    dayQuery(entradasConsolidadasRef, data),
    (snapshot) => {
      callback(sortByDateAndId(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))));
    },
    (error) => {
      console.error("Erro ao ouvir entradas consolidadas do dia:", error);
      callback([]);
      if (typeof onError === "function") onError(error);
    }
  );
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
