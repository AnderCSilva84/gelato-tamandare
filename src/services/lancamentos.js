import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

export async function criarLancamento(dados) {
  return addDoc(collection(db, "lancamentos"), {
    ...dados,
    uid: dados?.uid || null,
    criadoEm: serverTimestamp(),
  });
}

export function escutarLancamentosMes(uid, mes, callback) {
  if (!mes) {
    callback([]);
    return () => {};
  }

  const q = query(collection(db, "lancamentos"), where("mes", "==", mes));

  return onSnapshot(q, (snapshot) => {
    const lista = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const dataA = String(a?.data || "");
        const dataB = String(b?.data || "");
        const byDate = dataB.localeCompare(dataA);
        if (byDate !== 0) return byDate;
        return String(b?.id || "").localeCompare(String(a?.id || ""));
      });

    callback(lista);
  });
}

export function escutarTodosLancamentos(uid, callback) {
  return onSnapshot(collection(db, "lancamentos"), (snapshot) => {
    callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function apagarLancamento(uid, id) {
  if (!id) return;
  return deleteDoc(doc(db, "lancamentos", id));
}

export function hojeISO() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function mesISO() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  return `${ano}-${mes}`;
}
