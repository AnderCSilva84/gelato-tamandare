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

const produtosRef = collection(db, "produtos");

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
    notaFiscal: String(produto?.notaFiscal || "").trim(),
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
