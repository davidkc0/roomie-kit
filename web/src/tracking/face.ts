import {
  FaceLandmarker,
  FaceLandmarkerResult,
  FilesetResolver,
} from '@mediapipe/tasks-vision';
import { checkMediaPipeFiles } from './mediapipe-check';

let activeLandmarker: FaceLandmarker | null = null;
let animationHandle: number | null = null;
let currentStream: MediaStream | null = null;

const VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: 320,
    height: 240,
    frameRate: 30,
  },
  audio: false,
};

const BLEND_MAP: Record<string, number> = {
  browInnerUp: 6,
  eyeBlinkLeft: 8,
  eyeBlinkRight: 9,
  eyeLookDownLeft: 10,
  eyeLookDownRight: 11,
  eyeLookInLeft: 12,
  eyeLookInRight: 13,
  eyeLookOutLeft: 14,
  eyeLookOutRight: 15,
  eyeLookUpLeft: 16,
  eyeLookUpRight: 17,
  mouthSmileLeft: 44,
  mouthSmileRight: 45,
  mouthFrownLeft: 39,
  mouthFrownRight: 40,
  mouthPucker: 49,
  jawOpen: 26,
};

const normalizeBlend = (
  weights: number[]
): Record<string, number> => {
  const blend: Record<string, number> = {};
  Object.entries(BLEND_MAP).forEach(([name, index]) => {
    const value = weights[index] ?? 0;
    blend[name] = Math.min(1, Math.max(0, value));
  });
  return blend;
};

const getHeadQuaternion = (
  result: FaceLandmarkerResult
): [number, number, number, number] => {
  const matrix = result.facialTransformationMatrixes?.[0];
  if (!matrix || matrix.length < 16) {
    return [0, 0, 0, 1];
  }

  const m11 = matrix[0];
  const m12 = matrix[4];
  const m13 = matrix[8];
  const m21 = matrix[1];
  const m22 = matrix[5];
  const m23 = matrix[9];
  const m31 = matrix[2];
  const m32 = matrix[6];
  const m33 = matrix[10];

  const trace = m11 + m22 + m33;
  let qw: number;
  let qx: number;
  let qy: number;
  let qz: number;

  if (trace > 0) {
    const s = Math.sqrt(trace + 1.0) * 2;
    qw = 0.25 * s;
    qx = (m32 - m23) / s;
    qy = (m13 - m31) / s;
    qz = (m21 - m12) / s;
  } else if (m11 > m22 && m11 > m33) {
    const s = Math.sqrt(1.0 + m11 - m22 - m33) * 2;
    qw = (m32 - m23) / s;
    qx = 0.25 * s;
    qy = (m12 + m21) / s;
    qz = (m13 + m31) / s;
  } else if (m22 > m33) {
    const s = Math.sqrt(1.0 + m22 - m11 - m33) * 2;
    qw = (m13 - m31) / s;
    qx = (m12 + m21) / s;
    qy = 0.25 * s;
    qz = (m23 + m32) / s;
  } else {
    const s = Math.sqrt(1.0 + m33 - m11 - m22) * 2;
    qw = (m21 - m12) / s;
    qx = (m13 + m31) / s;
    qy = (m23 + m32) / s;
    qz = 0.25 * s;
  }

  const magnitude = Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz) || 1;
  return [qx / magnitude, qy / magnitude, qz / magnitude, qw / magnitude];
};

const ensureLandmarker = async () => {
  if (activeLandmarker) {
    return activeLandmarker;
  }

  // Check for required files before attempting to load
  const filesPresent = await checkMediaPipeFiles();
  if (!filesPresent) {
    throw new Error(
      'MediaPipe files are missing. Please run: node scripts/download-mediapipe.js'
    );
  }

  const fileset = await FilesetResolver.forVisionTasks(
    '/mediapipe'
  );

  activeLandmarker = await FaceLandmarker.createFromOptions(
    fileset,
    {
      baseOptions: {
        modelAssetPath: '/mediapipe/face_landmarker.task',
      },
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      runningMode: 'VIDEO',
      numFaces: 1,
    }
  );

  return activeLandmarker;
};

export async function startFaceTracking(
  videoEl: HTMLVideoElement,
  onData: (
    headQ: [number, number, number, number],
    blend: Record<string, number>
  ) => void
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia(
    VIDEO_CONSTRAINTS
  );
  currentStream = stream;
  videoEl.srcObject = stream;
  await videoEl.play();

  const landmarker = await ensureLandmarker();

  let lastTimestamp = -1;

  const step = async () => {
    if (!videoEl.srcObject) {
      return;
    }

    const now = performance.now();
    if (lastTimestamp !== -1 && now - lastTimestamp < 33) {
      animationHandle = requestAnimationFrame(step);
      return;
    }
    lastTimestamp = now;

    const result = await landmarker.detectForVideo(
      videoEl,
      now
    );

    const quaternion = getHeadQuaternion(result);
    const blendWeights =
      result.faceBlendshapes?.[0]?.categories?.map(
        (category) => category.score
      ) ?? [];
    const blend = normalizeBlend(blendWeights);

    onData(quaternion, blend);

    animationHandle = requestAnimationFrame(step);
  };

  animationHandle = requestAnimationFrame(step);

  return stream;
}

export function stopFaceTracking() {
  if (animationHandle) {
    cancelAnimationFrame(animationHandle);
    animationHandle = null;
  }

  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }

  if (activeLandmarker) {
    activeLandmarker.close();
    activeLandmarker = null;
  }
}

