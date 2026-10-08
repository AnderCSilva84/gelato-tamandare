import { Capacitor, registerPlugin } from '@capacitor/core';

const NaviaPrinter = registerPlugin('NaviaPrinter');
let emAndamento = false;

export function usaImpressoraInterna() {
  return Capacitor.getPlatform() === 'android';
}

export function consultarImpressoraInterna() {
  return NaviaPrinter.status();
}

export async function imprimirTextoNativo(text) {
  if (emAndamento) throw new Error('Aguarde a solicitação de impressão em andamento.');
  emAndamento = true;
  let timer;
  const job = NaviaPrinter.print({ text, qrCode: '', imageBase64: '', feedLines: 120 });
  // O timeout libera a tela, mas não cancela nem reenvia o trabalho nativo.
  job.finally(() => { emAndamento = false; }).catch(() => {});
  try {
    return await Promise.race([
      job,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ pending: true }), 12000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
