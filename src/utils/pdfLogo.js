function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getImageFormat(dataUrl) {
  const mime = String(dataUrl).match(/^data:image\/([^;,]+)/i)?.[1]?.toLowerCase();
  if (mime === "png") return "PNG";
  if (mime === "webp") return "WEBP";
  return "JPEG";
}

export async function getPdfLogo(logomarca) {
  const source = String(logomarca || "").trim();
  if (!source) return null;

  const dataUrl = source.startsWith("data:")
    ? source
    : await fetch(source).then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel carregar a logomarca.");
        return blobToDataUrl(await response.blob());
      });

  return { dataUrl, format: getImageFormat(dataUrl) };
}
