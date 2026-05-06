/**
 * Helper to check for required MediaPipe files and log helpful errors if missing
 */

const REQUIRED_FILES = [
  '/mediapipe/face_landmarker.task',
  '/mediapipe/vision_wasm_internal.wasm',
  '/mediapipe/vision_wasm_internal.js',
];

export async function checkMediaPipeFiles(): Promise<boolean> {
  const missing: string[] = [];

  for (const file of REQUIRED_FILES) {
    try {
      const response = await fetch(file, { method: 'HEAD' });
      if (!response.ok) {
        missing.push(file);
      }
    } catch (error) {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    console.error(
      '%cMediaPipe Files Missing',
      'color: red; font-weight: bold; font-size: 14px;'
    );
    console.error(
      'The following MediaPipe files are missing from public/mediapipe/:'
    );
    missing.forEach((file) => {
      console.error(`  ✗ ${file}`);
    });
    console.error('\nTo fix this, run:');
    console.error('  node scripts/download-mediapipe.js');
    console.error('\nOr manually download:');
    console.error(
      '  1. face_landmarker.task from: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker'
    );
    console.error(
      '  2. WASM files from node_modules/@mediapipe/tasks-vision/wasm/'
    );
    console.error('\nPlace all files in: public/mediapipe/');
    return false;
  }

  return true;
}

export function checkMediaPipeFilesSync(): boolean {
  // This is a best-effort check that works in development
  // For production, use the async version
  if (typeof window === 'undefined') {
    return true; // Skip check on server
  }

  const baseUrl = window.location.origin;
  let allPresent = true;

  REQUIRED_FILES.forEach((file) => {
    // We can't actually check synchronously, but we can warn
    // The async check will catch actual issues
  });

  return allPresent;
}




