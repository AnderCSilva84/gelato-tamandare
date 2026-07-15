import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

const gruposRef = collection(db, "grupos_produtos");

function gruposQuery(uid) {
  return query(gruposRef, where("uid", "==", uid));
}

function sortGrupos(items) {
  return [...items].sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
}

export function subscribeGruposProdutos(uid, callback, onError) {
  if (!uid) {
    callback([]);
    return () => {};
  }

  return onSnapshot(gruposQuery(uid), (snapshot) => {
    callback(sortGrupos(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))));
  }, (error) => {
    console.error("Erro ao carregar grupos de produtos:", error);
    callback([]);
    if (typeof onError === "function") onError(error);
  });
}

export function addGrupoProduto(uid, nome) {
  return addDoc(gruposRef, {
    uid,
    nome: String(nome || "").trim(),
    visivelPdv: true,
    criadoEm: serverTimestamp(),
  });
}

export function updateGrupoProduto(id, dados) {
  if (!id) throw new Error("Grupo invalido.");
  const payload = {};
  if (dados?.nome !== undefined) payload.nome = String(dados.nome).trim();
  if (dados?.visivelPdv !== undefined) payload.visivelPdv = Boolean(dados.visivelPdv);
  return updateDoc(doc(db, "grupos_produtos", id), payload);
}

export function deleteGrupoProduto(id) {
  if (!id) throw new Error("Grupo invalido.");
  return deleteDoc(doc(db, "grupos_produtos", id));
}
