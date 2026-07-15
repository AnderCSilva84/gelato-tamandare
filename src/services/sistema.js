import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

function configuracaoSistemaRef(uid) {
  return doc(db, "configuracoes", `sistema__${uid}`);
}

export const DEFAULT_SYSTEM_CONFIG = {
  maintenanceMode: false,
  maintenanceScope: "partial",
  maintenanceTitle: "Sistema temporariamente indisponivel",
  maintenanceMessage: "Estamos realizando uma manutencao programada. Tente novamente em alguns minutos.",
};

function normalizeSystemConfig(data) {
  const maintenanceScope = data?.maintenanceScope === "total" ? "total" : "partial";
  return {
    maintenanceMode: data?.maintenanceMode === true,
    maintenanceScope,
    maintenanceTitle: String(data?.maintenanceTitle || DEFAULT_SYSTEM_CONFIG.maintenanceTitle).trim(),
    maintenanceMessage: String(data?.maintenanceMessage || DEFAULT_SYSTEM_CONFIG.maintenanceMessage).trim(),
  };
}

export function subscribeSystemConfig(uid, callback) {
  return onSnapshot(configuracaoSistemaRef(uid), async (snapshot) => {
    if (!snapshot.exists()) {
      if (uid === "gelato-local") {
        const legacy = await getDoc(doc(db, "configuracoes", "sistema"));
        callback(legacy.exists() ? normalizeSystemConfig(legacy.data()) : DEFAULT_SYSTEM_CONFIG);
        return;
      }
      callback(DEFAULT_SYSTEM_CONFIG);
      return;
    }

    callback(normalizeSystemConfig(snapshot.data()));
  });
}

export async function saveSystemConfig(uid, data) {
  await setDoc(
    configuracaoSistemaRef(uid),
    {
      uid: uid || null,
      ...normalizeSystemConfig(data),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
