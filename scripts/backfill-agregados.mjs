import { readFileSync } from "node:fs";
import process from "node:process";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    return JSON.parse(readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf8"));
  }

  throw new Error(
    "Defina FIREBASE_SERVICE_ACCOUNT_JSON ou FIREBASE_SERVICE_ACCOUNT_PATH para executar o backfill."
  );
}

if (!getApps().length) {
  initializeApp({
    credential: cert(getServiceAccount()),
  });
}

const db = getFirestore();

function ensureResumo(mapa, dataKey) {
  if (!mapa[dataKey]) {
    mapa[dataKey] = {
      totalVendas: 0,
      totalDespesas: 0,
      lucro: 0,
      totalItens: 0,
    };
  }
  return mapa[dataKey];
}

function ensureRanking(mapa, dataKey) {
  if (!mapa[dataKey]) {
    mapa[dataKey] = { atendentes: {} };
  }
  return mapa[dataKey];
}

async function main() {
  const [vendasSnap, despesasSnap] = await Promise.all([
    db.collection("vendas").get(),
    db.collection("despesas").get(),
  ]);

  const resumoDiario = {};
  const rankingDiario = {};

  vendasSnap.forEach((docSnap) => {
    const venda = docSnap.data();
    const dataKey = String(venda?.data || "");
    if (!dataKey) return;

    const valor = Number(venda?.valor || 0);
    const quantidade = Number(venda?.quantidade || 0);
    const atendenteId = String(venda?.atendenteId || venda?.atendente || "");
    const atendenteNome = String(venda?.atendenteNome || venda?.atendente || "Sem atendente");

    const resumo = ensureResumo(resumoDiario, dataKey);
    resumo.totalVendas += valor;
    resumo.lucro += valor;
    resumo.totalItens += quantidade;

    if (atendenteId) {
      const ranking = ensureRanking(rankingDiario, dataKey);
      if (!ranking.atendentes[atendenteId]) {
        ranking.atendentes[atendenteId] = {
          nome: atendenteNome,
          total: 0,
        };
      }
      ranking.atendentes[atendenteId].nome = atendenteNome;
      ranking.atendentes[atendenteId].total += valor;
    }
  });

  despesasSnap.forEach((docSnap) => {
    const despesa = docSnap.data();
    const dataKey = String(despesa?.data || "");
    if (!dataKey) return;

    const valor = Number(despesa?.valor || 0);
    const resumo = ensureResumo(resumoDiario, dataKey);
    resumo.totalDespesas += valor;
    resumo.lucro -= valor;
  });

  const batch = db.batch();

  Object.entries(resumoDiario).forEach(([dataKey, resumo]) => {
    batch.set(db.collection("resumo_diario").doc(dataKey), resumo, { merge: true });
  });

  Object.entries(rankingDiario).forEach(([dataKey, ranking]) => {
    batch.set(db.collection("ranking_diario").doc(dataKey), ranking, { merge: true });
  });

  await batch.commit();

  console.log(
    `Backfill concluido: ${Object.keys(resumoDiario).length} resumos e ${Object.keys(rankingDiario).length} rankings atualizados.`
  );
}

main().catch((error) => {
  console.error("Falha no backfill dos agregados:", error);
  process.exit(1);
});
