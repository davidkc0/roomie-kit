import { Vector3, Matrix, Scene, Camera } from '@babylonjs/core';

/**
 * Converts a 3D world position to 2D screen coordinates
 * @param worldPosition The 3D position in world space
 * @param scene The Babylon.js scene
 * @param camera The camera to use for projection (defaults to active camera)
 * @returns Screen coordinates { x, y, z } or null if point is behind camera or invalid
 */
export function worldToScreen(
  worldPosition: Vector3,
  scene: Scene,
  camera?: Camera
): { x: number; y: number; z: number } | null {
  if (!scene || !scene.getEngine()) {
    return null;
  }

  const activeCamera = camera || scene.activeCamera;
  if (!activeCamera) {
    return null;
  }

  try {
    const engine = scene.getEngine();
    const identityMatrix = Matrix.Identity();
    const transformMatrix = scene.getTransformMatrix();
    const viewport = activeCamera.viewport.toGlobal(
      engine.getRenderWidth(),
      engine.getRenderHeight()
    );

    const screenCoords = Vector3.Project(
      worldPosition,
      identityMatrix,
      transformMatrix,
      viewport
    );

    // If z > 1, the point is behind the camera
    if (screenCoords.z > 1) {
      return null;
    }

    return {
      x: screenCoords.x,
      y: screenCoords.y,
      z: screenCoords.z,
    };
  } catch (error) {
    console.error('[worldToScreen] Error converting coordinates:', error);
    return null;
  }
}


