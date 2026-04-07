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

const atendentesRef = collection(db, "atendentes");

function cleanData(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

function atendentesQuery() {
  return query(atendentesRef, orderBy("nome", "asc"));
}

export async function addAtendente(uid, dados) {
  return addDoc(atendentesRef, {
    uid: uid || null,
    nome: String(dados?.nome || "").trim(),
    meta: Number(dados?.meta || 0),
    ativo: dados?.ativo ?? true,
    criadoEm: serverTimestamp(),
  });
}

export async function updateAtendente(id, dados) {
  if (!id) throw new Error("Atendente invalido.");

  return updateDoc(
    doc(db, "atendentes", id),
    cleanData({
      ...dados,
      nome: dados?.nome !== undefined ? String(dados.nome).trim() : undefined,
      meta: dados?.meta !== undefined ? Number(dados.meta) : undefined,
    })
  );
}

export async function deleteAtendente(id) {
  if (!id) throw new Error("Atendente invalido.");
  return deleteDoc(doc(db, "atendentes", id));
}

export async function getAtendentes() {
  const snapshot = await getDocs(atendentesQuery());
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export function subscribeAtendentes(uid, callback) {
  return onSnapshot(atendentesQuery(), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  });
}
