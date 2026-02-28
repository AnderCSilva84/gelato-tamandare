import {
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  doc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase";



// =======================================
// CRIAR LANÇAMENTO
// =======================================

export async function criarLancamento(dados) {
  const docData = {
    ...dados,
    criadoEm: serverTimestamp(),
  };

  return addDoc(collection(db, "lancamentos"), docData);
}

// =======================================
// ESCUTAR LANÇAMENTOS DO MÊS
// =======================================
// assinatura: (uid, mes, callback)

export function escutarLancamentosMes(uid, mes, callback) {
  // proteção contra query inválida
  if (!uid || !mes) {
    callback([]);
    return () => {};
  }

  const ref = collection(db, "lancamentos");

  const q = query(
    ref,
    where("uid", "==", uid),
    where("mes", "==", mes),
    orderBy("criadoEm", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const lista = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    callback(lista);
  });
}

// =======================================
// ESCUTAR TODOS LANÇAMENTOS (TOTAL GERAL)
// =======================================
// assinatura: (uid, callback)
// ✅ IMPORTANTE: sem orderBy pra não falhar em docs antigos sem criadoEm

export function escutarTodosLancamentos(uid, callback) {
  if (!uid) {
    callback([]);
    return () => {};
  }

  const ref = collection(db, "lancamentos");

  const q = query(
    ref,
    where("uid", "==", uid)
  );

  return onSnapshot(q, (snapshot) => {
    const lista = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    callback(lista);
  });
}

// =======================================
// APAGAR LANÇAMENTO
// =======================================
// assinatura: (uid, id)
// uid fica aqui pra futuras validações, mas o doc é apagado pelo id.

export async function apagarLancamento(uid, id) {
  if (!uid || !id) return;
  const ref = doc(db, "lancamentos", id);
  return deleteDoc(ref);
}

// =======================================
// UTIL DATA
// =======================================

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