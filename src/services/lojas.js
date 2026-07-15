import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export const DEFAULT_LOJA_ID = "gelato-local";
export const DEFAULT_LOJA = {
  id: DEFAULT_LOJA_ID,
  nome: "Gelato Tamandare",
  nomeFantasia: "Gelato Tamandare",
  documento: "",
  endereco: "",
  telefone: "",
  logomarca: "",
  ativa: true,
  redeId: "gelato",
  status: "ativa",
  mensagemManutencao: "Unidade temporariamente indisponivel.",
  imagemCapaPdv: "",
};

function normalizeLoja(id, dados = {}) {
  const statusPermitidos = ["ativa", "manutencao", "suspensa", "inativa"];
  const statusInformado = String(dados.status || (dados.ativa === false ? "inativa" : "ativa"));
  const status = statusPermitidos.includes(statusInformado) ? statusInformado : "ativa";
  const nomeInformado = String(dados.nome || dados.nomeFantasia || "").trim();
  const nomeLegado = nomeInformado.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const nome = id === "emporio-cafe" && (!nomeInformado || nomeLegado === "emporio-cafe" || nomeLegado === "emporio cafe")
    ? "cafe-guajara"
    : nomeInformado;
  const idNormalizado = String(id || "").toLowerCase();
  const nomeNormalizado = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const redeId = idNormalizado === "tamandare" || idNormalizado === "emporio-cafe" || idNormalizado === "cafe-guajara" || nomeNormalizado === "cafe-guajara" || nomeNormalizado === "emporio cafe"
    ? "emporio"
    : String(dados.redeId || (id === DEFAULT_LOJA_ID ? "gelato" : "")).trim();
  return {
    id,
    nome,
    nomeFantasia: nome,
    documento: String(dados.documento || "").trim(),
    endereco: String(dados.endereco || "").trim(),
    telefone: String(dados.telefone || "").trim(),
    logomarca: String(dados.logomarca || "").trim(),
    ativa: status === "ativa",
    status,
    mensagemManutencao: String(dados.mensagemManutencao || "Unidade temporariamente indisponivel.").trim(),
    imagemCapaPdv: String(dados.imagemCapaPdv || "").trim(),
    redeId,
  };
}

export function slugLoja(nome) {
  return String(nome || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function subscribeLojas(redeId, callback) {
  return onSnapshot(collection(db, "lojas"), (snapshot) => {
    const lojas = snapshot.docs.map((item) => normalizeLoja(item.id, item.data()))
      .filter((item) => !redeId || item.redeId === redeId || (redeId === "gelato" && item.id === DEFAULT_LOJA_ID) || (redeId === "emporio" && item.id === "emporio-cafe"));
    if ((!redeId || redeId === "gelato") && !lojas.some((item) => item.id === DEFAULT_LOJA_ID)) lojas.unshift(DEFAULT_LOJA);
    callback(lojas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
  });
}

export async function saveLoja(id, dados) {
  const lojaId = String(id || slugLoja(dados?.nome)).trim();
  if (!lojaId) throw new Error("Informe o nome da loja.");
  const payload = normalizeLoja(lojaId, dados);
  await setDoc(doc(db, "lojas", lojaId), {
    ...payload,
    id: lojaId,
    atualizadoEm: serverTimestamp(),
    criadoEm: dados?.criadoEm || serverTimestamp(),
  }, { merge: true });
  return lojaId;
}

export async function ensureDefaultLoja() {
  return saveLoja(DEFAULT_LOJA_ID, DEFAULT_LOJA);
}

export async function deleteLoja(id) {
  if (!id || id === DEFAULT_LOJA_ID) throw new Error("A loja principal nao pode ser excluida.");
  return deleteDoc(doc(db, "lojas", id));
}
