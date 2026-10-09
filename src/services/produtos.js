import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

const produtosRef = collection(db, "produtos");
const movimentacoesEstoqueRef = collection(db, "movimentacoes_estoque");

function cleanData(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

function produtosQuery(uid) {
  return query(produtosRef, where("uid", "==", uid));
}

function sortProdutos(items) {
  return [...items].sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
}

export async function addProduto(uid, produto) {
  const precoCusto = Number(produto?.precoCusto || 0);
  const precoFinalBase = produto?.precoFinal ?? produto?.preco ?? 0;
  const precoFinal = Number(precoFinalBase);
  const unidadeVenda = String(produto?.unidadeVenda || "un").trim().toLowerCase() === "kg" ? "kg" : "un";

  return addDoc(produtosRef, {
    uid: uid || null,
    cadastroGlobalId: String(produto?.cadastroGlobalId || "").trim(),
    nome: String(produto?.nome || "").trim(),
    imagem: String(produto?.imagem || "").trim(),
    preco: precoFinal,
    precoCusto,
    precoFinal,
    estoque: Number(produto?.estoque || 0),
    giroDiario: {},
    giroInicializado: true,
    notaFiscal: String(produto?.notaFiscal || "").trim(),
    ...(produto?.notaFiscalAnexo ? { notaFiscalAnexo: produto.notaFiscalAnexo } : {}),
    grupoId: String(produto?.grupoId || "").trim(),
    grupoNome: String(produto?.grupoNome || "").trim(),
    unidadeVenda,
    ativo: produto?.ativo ?? true,
    criadoEm: serverTimestamp(),
  });
}

export async function copiarProdutoParaLojas(produto, lojaIds = []) {
  if (!produto?.id) throw new Error("Produto invalido.");
  const destinos = [...new Set(lojaIds.map(String).filter((id) => id && id !== produto.uid))];
  if (!destinos.length) return 0;

  const cadastroGlobalId = String(produto.cadastroGlobalId || produto.id);
  if (!produto.cadastroGlobalId) await updateProduto(produto.id, { cadastroGlobalId });

  const payload = {
    ...produto,
    cadastroGlobalId,
    grupoId: "",
    estoque: 0,
  };
  delete payload.id;
  delete payload.uid;
  delete payload.criadoEm;
  delete payload.notaFiscalAnexo;

  const verificacoes = await Promise.all(destinos.map(async (lojaId) => ({
    lojaId,
    produtos: await getProdutos(lojaId),
  })));
  const pendentes = verificacoes
    .filter(({ produtos }) => !produtos.some((item) => String(item.cadastroGlobalId || "") === cadastroGlobalId))
    .map(({ lojaId }) => lojaId);
  await Promise.all(pendentes.map((lojaId) => addProduto(lojaId, payload)));
  return pendentes.length;
}

export async function updateProduto(id, dados) {
  if (!id) throw new Error("Produto invalido.");

  return updateDoc(
    doc(db, "produtos", id),
    cleanData({
      ...dados,
      nome: dados?.nome !== undefined ? String(dados.nome).trim() : undefined,
      imagem: dados?.imagem !== undefined ? String(dados.imagem).trim() : undefined,
      preco:
        dados?.precoFinal !== undefined
          ? Number(dados.precoFinal)
          : dados?.preco !== undefined
            ? Number(dados.preco)
            : undefined,
      precoCusto: dados?.precoCusto !== undefined ? Number(dados.precoCusto) : undefined,
      precoFinal:
        dados?.precoFinal !== undefined
          ? Number(dados.precoFinal)
          : dados?.preco !== undefined
            ? Number(dados.preco)
            : undefined,
      estoque: dados?.estoque !== undefined ? Number(dados.estoque) : undefined,
      notaFiscal:
        dados?.notaFiscal !== undefined ? String(dados.notaFiscal).trim() : undefined,
      grupoId: dados?.grupoId !== undefined ? String(dados.grupoId).trim() : undefined,
      grupoNome: dados?.grupoNome !== undefined ? String(dados.grupoNome).trim() : undefined,
      unidadeVenda:
        dados?.unidadeVenda !== undefined
          ? String(dados.unidadeVenda).trim().toLowerCase() === "kg"
            ? "kg"
            : "un"
          : undefined,
    })
  );
}

export async function registrarMovimentacaoEstoque(produto, quantidade, observacao, dadosNota = {}) {
  if (!produto?.id || !produto?.uid) throw new Error("Produto invalido.");

  const quantidadeMovimentada = Number(quantidade);
  const descricao = String(observacao || "").trim();
  if (!Number.isFinite(quantidadeMovimentada) || quantidadeMovimentada === 0) {
    throw new Error("Informe uma quantidade diferente de zero.");
  }
  if (!descricao) throw new Error("Informe a observacao da movimentacao.");

  const produtoRef = doc(db, "produtos", produto.id);
  const movimentacaoRef = doc(movimentacoesEstoqueRef);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(produtoRef);
    if (!snapshot.exists()) throw new Error("Produto nao encontrado.");

    const estoqueAnterior = Number(snapshot.data().estoque || 0);
    const estoqueAtual = estoqueAnterior + quantidadeMovimentada;
    if (estoqueAtual < 0) {
      throw new Error("A retirada nao pode deixar o estoque negativo.");
    }

    transaction.update(produtoRef, cleanData({ ...dadosNota.produtoDados, estoque: estoqueAtual }));
    transaction.set(movimentacaoRef, {
      uid: produto.uid,
      produtoId: produto.id,
      produto: String(snapshot.data().nome || produto.nome || "").trim(),
      tipo: quantidadeMovimentada > 0 ? "ENTRADA" : "SAIDA",
      quantidade: Math.abs(quantidadeMovimentada),
      variacao: quantidadeMovimentada,
      estoqueAnterior,
      estoqueAtual,
      observacao: descricao,
      ...(dadosNota.notaFiscal !== undefined ? { notaFiscal: String(dadosNota.notaFiscal).trim() } : {}),
      ...(dadosNota.anexo ? { notaFiscalAnexo: dadosNota.anexo } : {}),
      criadoEm: serverTimestamp(),
    });

    return estoqueAtual;
  });
}

export function subscribeMovimentacoesEstoque(uid, callback, onError) {
  const movimentacoesQuery = query(movimentacoesEstoqueRef, where("uid", "==", uid), orderBy("criadoEm", "desc"), limit(30));
  return onSnapshot(movimentacoesQuery, (snapshot) => {
    const lista = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    lista.sort((a, b) => {
      const dataA = a.criadoEm?.toMillis?.() || 0;
      const dataB = b.criadoEm?.toMillis?.() || 0;
      return dataB - dataA;
    });
    callback(lista);
  }, (error) => {
    console.error("Erro ao carregar movimentacoes de estoque:", error);
    callback([]);
    if (typeof onError === "function") onError(error);
  });
}

export async function deleteProduto(id) {
  if (!id) throw new Error("Produto invalido.");
  return deleteDoc(doc(db, "produtos", id));
}

export async function getProdutos(uid) {
  const snapshot = await getDocs(produtosQuery(uid));
  return sortProdutos(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
}

export function subscribeProdutos(uid, callback, onError) {
  return onSnapshot(produtosQuery(uid), (snapshot) => {
    callback(sortProdutos(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))));
  }, (error) => {
    console.error("Erro ao carregar produtos:", error);
    callback([]);
    if (typeof onError === "function") onError(error);
  });
}
