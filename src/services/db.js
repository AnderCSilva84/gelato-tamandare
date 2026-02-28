import { db } from "./firebase";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

export async function criarEntrada(valor, descricao) {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) throw new Error("Usuário não autenticado");

  const hoje = new Date();
  const mes = hoje.toISOString().slice(0, 7);
  const data = hoje.toISOString().slice(0, 10);

  await addDoc(collection(db, "lancamentos"), {
    uid: user.uid,
    tipo: "ENTRADA",
    valor: Number(valor),
    descricao: descricao || "",
    mes,
    data,
    criadoEm: serverTimestamp()
  });
}

export function observarExtrato(mes, callback) {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) return;

  const q = query(
    collection(db, "lancamentos"),
    where("uid", "==", user.uid),
    where("mes", "==", mes),
    orderBy("criadoEm", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const dados = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    callback(dados);
  });
}