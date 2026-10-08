import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "./firebase";

const MAX_PROFILE_PHOTO_SIZE = 300 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function uploadFotoPerfil(lojaId, file) {
  if (!file) return "";
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("Use uma foto JPG, PNG ou WebP.");
  if (file.size > MAX_PROFILE_PHOTO_SIZE) throw new Error("A foto do perfil deve ter no maximo 300 KB.");

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const fileId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const authUid = auth.currentUser?.uid;
  if (!authUid) throw new Error("Entre novamente no sistema para enviar a foto.");
  const fotoRef = ref(storage, `fotos_perfil/${authUid}/${String(lojaId)}/${fileId}.${extension}`);
  await uploadBytes(fotoRef, file, { contentType: file.type });
  return getDownloadURL(fotoRef);
}

export async function deleteFotoPerfil(url) {
  if (!url || !String(url).includes("/fotos_perfil%2F")) return;
  try {
    await deleteObject(ref(storage, url));
  } catch (error) {
    if (error?.code !== "storage/object-not-found") throw error;
  }
}
