import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

const panelAccessRef = collection(db, "acessos_painel");

function cleanData(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

export function subscribePanelAccess(authUid, callback) {
  if (!authUid) {
    callback(null);
    return () => {};
  }

  return onSnapshot(doc(db, "acessos_painel", authUid), (snapshot) => {
    callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
  });
}

export function subscribeHasPanelAccess(callback) {
  return onSnapshot(query(panelAccessRef, limit(1)), (snapshot) => {
    callback(!snapshot.empty);
  });
}

export async function hasAnyPanelAccess() {
  const snapshot = await getDocs(query(panelAccessRef, limit(1)));
  return !snapshot.empty;
}

export async function savePanelAccess(authUid, data) {
  if (!authUid) throw new Error("Usuario de acesso invalido.");

  await setDoc(
    doc(db, "acessos_painel", authUid),
    cleanData({
      atendenteId: String(data?.atendenteId || "").trim(),
      nome: String(data?.nome || "").trim(),
      role: String(data?.role || "").trim(),
      ativo: data?.ativo ?? true,
      email: data?.email !== undefined ? String(data.email).trim().toLowerCase() : undefined,
      updatedAt: serverTimestamp(),
      createdAt: data?.createdAt ?? serverTimestamp(),
    }),
    { merge: true }
  );
}

export async function updatePanelAccess(authUid, data) {
  if (!authUid) throw new Error("Usuario de acesso invalido.");

  await updateDoc(
    doc(db, "acessos_painel", authUid),
    cleanData({
      atendenteId: data?.atendenteId !== undefined ? String(data.atendenteId).trim() : undefined,
      nome: data?.nome !== undefined ? String(data.nome).trim() : undefined,
      role: data?.role !== undefined ? String(data.role).trim() : undefined,
      ativo: data?.ativo,
      email: data?.email !== undefined ? String(data.email).trim().toLowerCase() : undefined,
      updatedAt: serverTimestamp(),
    })
  );
}

export async function deletePanelAccess(authUid) {
  if (!authUid) return;
  await deleteDoc(doc(db, "acessos_painel", authUid));
}
