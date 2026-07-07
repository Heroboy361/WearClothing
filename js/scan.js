// Kamera-Scan: Foto + Körpergröße -> Maßschätzung über anthropometrische Proportionen.
// (LiDAR ist im Browser nicht verfügbar; die Schätzung basiert auf Größe, Körperbau
// und Standard-Körperproportionen und lässt sich danach manuell feinjustieren.)

let stream = null;

export async function startCamera(videoEl) {
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1707 } },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();
}

export function stopCamera(videoEl) {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  videoEl.srcObject = null;
}

export function capturePhoto(videoEl, canvasEl) {
  const w = videoEl.videoWidth, h = videoEl.videoHeight;
  if (!w) return null;
  canvasEl.width = w;
  canvasEl.height = h;
  canvasEl.getContext('2d').drawImage(videoEl, 0, 0, w, h);
  return canvasEl.toDataURL('image/jpeg', 0.8);
}

// Faktoren je Körperbau relativ zu Durchschnittsproportionen
const BUILD = {
  schlank:    { chest: 0.94, waist: 0.90, hip: 0.95, shoulder: 0.97 },
  normal:     { chest: 1.0,  waist: 1.0,  hip: 1.0,  shoulder: 1.0 },
  athletisch: { chest: 1.06, waist: 0.95, hip: 1.0,  shoulder: 1.06 },
  kräftig:    { chest: 1.12, waist: 1.14, hip: 1.08, shoulder: 1.04 },
};

/**
 * Schätzt Körpermaße aus Größe + Körperbau (anthropometrische Mittelwerte).
 * @returns {shoulder, chest, waist, hip, inseam, arm} in cm
 */
export function estimateMeasurements(heightCm, build = 'normal') {
  const f = BUILD[build] || BUILD.normal;
  const h = heightCm;
  return {
    shoulder: Math.round(h * 0.251 * f.shoulder),
    chest:    Math.round(h * 0.548 * f.chest),
    waist:    Math.round(h * 0.468 * f.waist),
    hip:      Math.round(h * 0.551 * f.hip),
    inseam:   Math.round(h * 0.457),
    arm:      Math.round(h * 0.34),
  };
}

// Grobe Analyse des Fotos: mittlerer Hautton aus der Bildmitte (Gesichts-/Halsbereich der Silhouette)
export function sampleSkinTone(canvasEl) {
  try {
    const ctx = canvasEl.getContext('2d');
    const w = canvasEl.width, h = canvasEl.height;
    if (!w) return null;
    // Bereich, in dem laut Silhouette der Kopf liegt (oben mittig)
    const data = ctx.getImageData(Math.floor(w * 0.42), Math.floor(h * 0.06), Math.floor(w * 0.16), Math.floor(h * 0.10)).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 16) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    if (!n) return null;
    r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
    // Nur übernehmen, wenn es plausibel nach Haut aussieht (warm, nicht zu dunkel/hell)
    const isSkinLike = r > 60 && r > b && r - b > 10 && r < 250;
    if (!isSkinLike) return null;
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}
