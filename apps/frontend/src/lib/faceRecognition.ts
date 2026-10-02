import * as faceapi from "face-api.js";

let loaded: Promise<void> | null = null;
// Models are static files in public/models (tiny face detector + 68-point landmarks + the
// recognition net that produces the 128-length embedding) — loaded once, cached by the browser.
export function loadFaceModels() {
  loaded ??= (async () => {
    await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
    await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
    await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
  })();
  return loaded;
}

// One face, one embedding — multiple faces in frame (or none) return null so callers can
// prompt "only one person at a time" instead of guessing.
export async function detectSingleFaceDescriptor(input: HTMLVideoElement | HTMLCanvasElement) {
  const results = await faceapi.detectAllFaces(input, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptors();
  if (results.length !== 1) return null;
  return Array.from(results[0].descriptor);
}

export function euclideanDistance(a: number[], b: number[]) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

// face-api.js's own recommendation: < 0.6 is the same person for the 128-d recognition net.
export const FACE_MATCH_THRESHOLD = 0.55;

export function findBestMatch(descriptor: number[], enrolled: { id: string; name: string; descriptor: number[] }[]) {
  let best: { id: string; name: string; distance: number } | null = null;
  for (const e of enrolled) {
    const d = euclideanDistance(descriptor, e.descriptor);
    if (!best || d < best.distance) best = { id: e.id, name: e.name, distance: d };
  }
  if (!best || best.distance > FACE_MATCH_THRESHOLD) return null;
  return { ...best, confidence: Math.max(0, 1 - best.distance / FACE_MATCH_THRESHOLD) };
}
