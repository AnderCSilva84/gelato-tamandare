import { Capacitor } from '@capacitor/core';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from './firebase';
import { TIPOS_NOTA_FISCAL, validarNotaFiscal } from '../utils/notaFiscalArquivo';

export { validarNotaFiscal };

export async function uploadNotaFiscal(lojaId, file) {
  if (Capacitor.isNativePlatform()) throw new Error('Anexos de nota fiscal estão disponíveis somente no PWA.');
  validarNotaFiscal(file);
  if (!lojaId || !auth.currentUser) throw new Error('Entre na loja novamente para anexar a nota.');
  const caminho = `notas_fiscais/${lojaId}/${crypto.randomUUID()}.${TIPOS_NOTA_FISCAL[file.type]}`;
  const arquivoRef = ref(storage, caminho);
  await uploadBytes(arquivoRef, file, { contentType: file.type });
  try {
    return { nome: file.name, caminho, url: await getDownloadURL(arquivoRef), tamanho: file.size, tipo: file.type };
  } catch (error) {
    await deleteObject(arquivoRef).catch(() => {});
    throw error;
  }
}

export async function excluirNotaNaoVinculada(anexo) {
  if (anexo?.caminho) await deleteObject(ref(storage, anexo.caminho));
}
