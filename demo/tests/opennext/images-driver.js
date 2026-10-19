(async () => {
  const report = (data) =>
    fetch("/__acceptance/report", {
      method: "POST",
      body: JSON.stringify(data),
    });
  try {
    const image = document.querySelector('img[alt="Optimized sample"]');
    if (!image.complete)
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(Error("Image failed to load"));
      });
    if (!image.naturalWidth) throw Error("Empty image");
    const url = new URL(image.currentSrc);
    if (url.pathname !== "/_next/image")
      throw Error("Optimization bypassed: " + url);
    const response = await fetch(url.href, {
      headers: { accept: "image/webp" },
    });
    if (!response.ok) throw Error("Image endpoint status " + response.status);
    const blob = await response.blob();
    if (blob.type !== "image/webp")
      throw Error("Not optimized to WebP: " + blob.type);
    const bitmap = await createImageBitmap(blob);
    if (bitmap.width !== Number(url.searchParams.get("w")))
      throw Error("Image width mismatch: " + bitmap.width);
    bitmap.close();
    await report({
      stage: "complete",
      platform: window.Capacitor?.getPlatform?.(),
      width: Number(url.searchParams.get("w")),
      format: blob.type,
    });
  } catch (error) {
    await report({ stage: "failure", error: String(error) });
  }
})();
