export async function compressPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = source;
    });
    if (!image) return file;
    const renderJpeg = async (maxSide: number, quality: number) => {
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    };
    let blob = await renderJpeg(1440, 0.72);
    if (blob && blob.size > 650 * 1024) blob = await renderJpeg(1080, 0.62);
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(source);
  }
}
