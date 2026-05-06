import { useEffect, useRef } from 'react';
import { useScene } from './scene';
import {
  MeshBuilder,
  StandardMaterial,
  Vector3,
  AbstractMesh,
  Texture,
  Mesh,
} from '@babylonjs/core';

const WALL_WIDTH = 20;
const WALL_HEIGHT = 4;
const ROOM_DEPTH = 20;

type WallsProps = {
  onWhiteboardCreated?: (mesh: AbstractMesh) => void;
};

export function Walls({ onWhiteboardCreated }: WallsProps) {
  const { scene } = useScene();
  const wallsCreatedRef = useRef(false);
  const onWhiteboardCreatedRef = useRef(onWhiteboardCreated);

  // Update ref when callback changes
  useEffect(() => {
    onWhiteboardCreatedRef.current = onWhiteboardCreated;
  }, [onWhiteboardCreated]);

  useEffect(() => {
    if (wallsCreatedRef.current || !scene) return;
    wallsCreatedRef.current = true;

    // Back wall (whiteboard) - at z = -10, facing forward (+Z direction)
    const backWall = MeshBuilder.CreatePlane(
      'backWall',
      {
        width: WALL_WIDTH,
        height: WALL_HEIGHT,
      },
      scene
    );
    backWall.position = new Vector3(0, WALL_HEIGHT / 2, -ROOM_DEPTH / 2);
    const backMaterial = new StandardMaterial('backWallMaterial', scene);
    // Color: #f5f5f0 (light beige/cream)
    const beigeR = 245 / 255;
    const beigeG = 245 / 255;
    const beigeB = 240 / 255;
    backMaterial.diffuseColor = { r: beigeR, g: beigeG, b: beigeB, a: 1 } as any;
    backMaterial.emissiveColor = { r: beigeR, g: beigeG, b: beigeB, a: 1 } as any;
    backMaterial.backFaceCulling = false;
    backMaterial.disableLighting = true; // Always show beige color
    backMaterial.alpha = 1.0;
    backMaterial.specularColor = { r: 0, g: 0, b: 0, a: 1 } as any;
    backWall.material = backMaterial;
    backWall.isVisible = true;
    backWall.setEnabled(true);
    backWall.renderingGroupId = 0;
    // Enable collision on wall
    backWall.checkCollisions = true;
    
    console.log('[Walls] Created back wall (whiteboard) - beige color, collision enabled');

    // Left wall - at x = -10, rotated 90° around Y axis
    const leftWall = MeshBuilder.CreatePlane(
      'leftWall',
      {
        width: ROOM_DEPTH,
        height: WALL_HEIGHT,
      },
      scene
    );
    leftWall.position = new Vector3(-WALL_WIDTH / 2, WALL_HEIGHT / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    const leftMaterial = new StandardMaterial('leftWallMaterial', scene);
    const brickTexture = new Texture(
      '/brick.jpg',
      scene
    );
    brickTexture.wrapU = Texture.WRAP_ADDRESSMODE;
    brickTexture.wrapV = Texture.WRAP_ADDRESSMODE;
    // Calculate how many times to repeat based on wall size
    // Wall is 20 units wide, 4 units tall
    brickTexture.uScale = ROOM_DEPTH / 2; // Repeat every 2 units
    brickTexture.vScale = WALL_HEIGHT / 2; // Repeat every 2 units
    leftMaterial.diffuseTexture = brickTexture;
    leftMaterial.backFaceCulling = false;
    leftWall.material = leftMaterial;
    leftWall.checkCollisions = true; // Enable collision
    console.log('[Walls] Created left wall at', leftWall.position);

    // Right wall - at x = 10, rotated -90° around Y axis
    const rightWall = MeshBuilder.CreatePlane(
      'rightWall',
      {
        width: ROOM_DEPTH,
        height: WALL_HEIGHT,
      },
      scene
    );
    rightWall.position = new Vector3(WALL_WIDTH / 2, WALL_HEIGHT / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    const rightMaterial = new StandardMaterial('rightWallMaterial', scene);
    const brickTexture2 = new Texture(
      '/brick.jpg',
      scene
    );
    brickTexture2.wrapU = Texture.WRAP_ADDRESSMODE;
    brickTexture2.wrapV = Texture.WRAP_ADDRESSMODE;
    brickTexture2.uScale = ROOM_DEPTH / 2;
    brickTexture2.vScale = WALL_HEIGHT / 2;
    rightMaterial.diffuseTexture = brickTexture2;
    rightMaterial.backFaceCulling = false;
    rightWall.material = rightMaterial;
    rightWall.checkCollisions = true; // Enable collision
    console.log('[Walls] Created right wall at', rightWall.position);

    // Front wall - at z = 10, rotated 180° around Y axis
    const frontWall = MeshBuilder.CreatePlane(
      'frontWall',
      {
        width: WALL_WIDTH,
        height: WALL_HEIGHT,
      },
      scene
    );
    frontWall.position = new Vector3(0, WALL_HEIGHT / 2, ROOM_DEPTH / 2);
    frontWall.rotation.y = Math.PI;
    const frontMaterial = new StandardMaterial('frontWallMaterial', scene);
    const brickTexture3 = new Texture(
      '/brick.jpg',
      scene
    );
    brickTexture3.wrapU = Texture.WRAP_ADDRESSMODE;
    brickTexture3.wrapV = Texture.WRAP_ADDRESSMODE;
    brickTexture3.uScale = WALL_WIDTH / 2;
    brickTexture3.vScale = WALL_HEIGHT / 2;
    frontMaterial.diffuseTexture = brickTexture3;
    frontMaterial.backFaceCulling = false;
    frontWall.material = frontMaterial;
    frontWall.checkCollisions = true; // Enable collision
    console.log('[Walls] Created front wall at', frontWall.position);
    console.log('[Walls] All walls created successfully');

    // Notify parent that whiteboard (back wall) is ready
    if (onWhiteboardCreatedRef.current) {
      onWhiteboardCreatedRef.current(backWall);
    }

    return () => {
      // Cleanup on unmount
      backWall.dispose();
      leftWall.dispose();
      rightWall.dispose();
      frontWall.dispose();
      backMaterial.dispose();
      leftMaterial.dispose();
      rightMaterial.dispose();
      frontMaterial.dispose();
      brickTexture.dispose();
      brickTexture2.dispose();
      brickTexture3.dispose();
      wallsCreatedRef.current = false;
    };
  }, [scene]);

  return null;
}



