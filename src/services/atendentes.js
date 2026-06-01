import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { normalizeRole } from "../utils/access";

const atendentesRef = collection(db, "atendentes");

function cleanData(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

function atendentesQuery() {
  return query(atendentesRef, orderBy("nome", "asc"));
}

function getCurrentMonthKey(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
  }).formatToParts(referenceDate);
  const year = parts.find((item) => item.type === "year")?.value || "0000";
  const month = parts.find((item) => item.type === "month")?.value || "01";
  return `${year}-${month}`;
}

export async function addAtendente(uid, dados) {
  const meta = Number(dados?.meta || 0);
  return addDoc(atendentesRef, {
    uid: uid || null,
    nome: String(dados?.nome || "").trim(),
    meta,
    metasMensais: {
      [getCurrentMonthKey()]: meta,
    },
    senha: String(dados?.senha || "").trim(),
    role: normalizeRole(dados?.role),
    emailAcesso: String(dados?.emailAcesso || "").trim().toLowerCase(),
    authUid: String(dados?.authUid || "").trim(),
    ativo: dados?.ativo ?? true,
    criadoEm: serverTimestamp(),
  });
}

export async function updateAtendente(id, dados) {
  if (!id) throw new Error("Atendente invalido.");

  let metasMensais = dados?.metasMensais;

  if (dados?.meta !== undefined && metasMensais === undefined) {
    const snapshot = await getDoc(doc(db, "atendentes", id));
    const atual = snapshot.exists() ? snapshot.data() : {};
    metasMensais = {
      ...(atual?.metasMensais || {}),
      [getCurrentMonthKey()]: Number(dados.meta || 0),
    };
  }

  return updateDoc(
    doc(db, "atendentes", id),
    cleanData({
      ...dados,
      nome: dados?.nome !== undefined ? String(dados.nome).trim() : undefined,
      meta: dados?.meta !== undefined ? Number(dados.meta) : undefined,
      senha: dados?.senha !== undefined ? String(dados.senha).trim() : undefined,
      role: dados?.role !== undefined ? normalizeRole(dados.role) : undefined,
      emailAcesso:
        dados?.emailAcesso !== undefined ? String(dados.emailAcesso).trim().toLowerCase() : undefined,
      authUid: dados?.authUid !== undefined ? String(dados.authUid).trim() : undefined,
      metasMensais,
      ativo: dados?.ativo,
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
