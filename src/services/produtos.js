import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

const produtosRef = collection(db, "produtos");

function cleanData(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

function produtosQuery() {
  return query(produtosRef, orderBy("nome", "asc"));
}

export async function addProduto(uid, produto) {
  const precoCusto = Number(produto?.precoCusto || 0);
  const precoFinalBase = produto?.precoFinal ?? produto?.preco ?? 0;
  const precoFinal = Number(precoFinalBase);

  return addDoc(produtosRef, {
    uid: uid || null,
    nome: String(produto?.nome || "").trim(),
    imagem: String(produto?.imagem || "").trim(),
    preco: precoFinal,
    precoCusto,
    precoFinal,
    estoque: Number(produto?.estoque || 0),
    notaFiscal: String(produto?.notaFiscal || "").trim(),
    ativo: produto?.ativo ?? true,
    criadoEm: serverTimestamp(),
  });
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
    })
  );
}

export async function deleteProduto(id) {
  if (!id) throw new Error("Produto invalido.");
  return deleteDoc(doc(db, "produtos", id));
}

export async function getProdutos() {
  const snapshot = await getDocs(produtosQuery());
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export function subscribeProdutos(uid, callback) {
  return onSnapshot(produtosQuery(), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  });
}
