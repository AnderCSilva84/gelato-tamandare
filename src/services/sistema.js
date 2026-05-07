import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

const configuracaoSistemaRef = doc(db, "configuracoes", "sistema");

export const DEFAULT_SYSTEM_CONFIG = {
  maintenanceMode: false,
  maintenanceTitle: "Sistema temporariamente indisponivel",
  maintenanceMessage: "Estamos realizando uma manutencao programada. Tente novamente em alguns minutos.",
};

function normalizeSystemConfig(data) {
  return {
    maintenanceMode: data?.maintenanceMode === true,
    maintenanceTitle: String(data?.maintenanceTitle || DEFAULT_SYSTEM_CONFIG.maintenanceTitle).trim(),
    maintenanceMessage: String(data?.maintenanceMessage || DEFAULT_SYSTEM_CONFIG.maintenanceMessage).trim(),
  };
}

export function subscribeSystemConfig(callback) {
  return onSnapshot(configuracaoSistemaRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback(DEFAULT_SYSTEM_CONFIG);
      return;
    }

    callback(normalizeSystemConfig(snapshot.data()));
  });
}

export async function saveSystemConfig(uid, data) {
  await setDoc(
    configuracaoSistemaRef,
    {
      uid: uid || null,
      ...normalizeSystemConfig(data),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
