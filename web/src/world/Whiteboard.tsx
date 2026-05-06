import { useEffect, useRef, useState, useCallback } from 'react';
import { useScene } from './scene';
import {
  DynamicTexture,
  StandardMaterial,
  AbstractMesh,
} from '@babylonjs/core';
import {
  subscribeWhiteboardState,
  type DrawingStroke,
} from '../multiplayer/whiteboardSync';

const TEXTURE_WIDTH = 2048;

type WhiteboardProps = {
  whiteboardMesh: AbstractMesh | null;
  drawingMode: boolean;
  onExitDrawingMode: () => void;
  textureRef: React.MutableRefObject<DynamicTexture | null>;
  onTextureUpdated?: () => void;
  roomKey?: string;
  aspectRatio?: number; // width / height of the whiteboard mesh (e.g. 5 for 20x4)
};

export function Whiteboard({ whiteboardMesh, drawingMode, onExitDrawingMode, textureRef, onTextureUpdated, roomKey, aspectRatio = 5 }: WhiteboardProps) {
  const textureHeight = Math.round(TEXTURE_WIDTH / aspectRatio);
  const { scene } = useScene();
  const materialRef = useRef<StandardMaterial | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Function to apply texture to material (like applying a painting)
  const applyTextureToMaterial = useCallback(() => {
    if (!whiteboardMesh || !textureRef.current) {
      console.warn('[Whiteboard] Cannot apply texture: missing mesh or texture');
      return;
    }

    try {
      const mat = whiteboardMesh.material as StandardMaterial;
      if (!mat) {
        console.warn('[Whiteboard] Cannot apply texture: no material');
        return;
      }

      // Apply the texture as a new asset (like a painting)
      mat.diffuseTexture = textureRef.current;
      const beigeR = 245 / 255;
      const beigeG = 245 / 255;
      const beigeB = 240 / 255;

      // Set material properties to show texture properly
      mat.diffuseColor = { r: 1, g: 1, b: 1, a: 1 } as any; // White so texture shows clearly
      mat.emissiveColor = { r: beigeR, g: beigeG, b: beigeB, a: 1 } as any; // Beige tint
      mat.specularColor = { r: 0, g: 0, b: 0, a: 1 } as any;
      mat.backFaceCulling = false;
      mat.disableLighting = true;
      mat.alpha = 1.0;

      // Force material to refresh
      mat.markAsDirty();

      // Force texture update (with null check)
      try {
        const internalTexture = textureRef.current.getInternalTexture();
        if (internalTexture && typeof internalTexture.update === 'function') {
          internalTexture.update();
        }
      } catch (textureError) {
        console.warn('[Whiteboard] Could not update internal texture', textureError);
      }

      console.log('[Whiteboard] ✅ Applied texture to whiteboard material');
    } catch (error) {
      console.error('[Whiteboard] Error applying texture to material', error);
    }
  }, [whiteboardMesh, textureRef]);

  // Initialize texture and material
  useEffect(() => {
    if (!whiteboardMesh || isInitialized) return;

    whiteboardMesh.isVisible = true;
    whiteboardMesh.setEnabled(true);

    let material = whiteboardMesh.material as StandardMaterial;

    if (!material || !(material instanceof StandardMaterial)) {
      material = new StandardMaterial('whiteboardMaterial', scene);
      whiteboardMesh.material = material;
    }

    const beigeR = 245 / 255;
    const beigeG = 245 / 255;
    const beigeB = 240 / 255;
    const beigeColor = { r: beigeR, g: beigeG, b: beigeB, a: 1 } as any;

    material.diffuseColor = beigeColor;
    material.emissiveColor = beigeColor;
    material.specularColor = { r: 0, g: 0, b: 0, a: 1 } as any;
    material.ambientColor = beigeColor;
    material.backFaceCulling = false;
    material.disableLighting = true;
    material.alpha = 1.0;

    material.markAsDirty();
    materialRef.current = material;

    try {
      const texture = new DynamicTexture(
        'whiteboardTexture',
        { width: TEXTURE_WIDTH, height: textureHeight },
        scene,
        true
      );
      textureRef.current = texture;

      const ctx = texture.getContext();
      ctx.fillStyle = '#f5f5f0';
      ctx.fillRect(0, 0, TEXTURE_WIDTH, textureHeight);
      texture.update();

      setIsInitialized(true);
    } catch (error) {
      console.error('[Whiteboard] Failed to create texture', error);
      setIsInitialized(true);
    }

    return () => {
      // Don't dispose texture - we want to keep it as an asset
      materialRef.current = null;
    };
  }, [scene, whiteboardMesh, isInitialized, textureRef]);

  // Subscribe to whiteboard state changes
  useEffect(() => {
    if (!isInitialized || !textureRef.current) return;

    console.log('[Whiteboard] Subscribing to whiteboard state changes');

    const unsubscribe = subscribeWhiteboardState((state) => {
      if (!textureRef.current) {
        console.warn('[Whiteboard] Texture ref is null, skipping state update');
        return;
      }

      try {
        console.log('[Whiteboard] Received state update with', state.strokes.length, 'strokes');

        const ctx = textureRef.current.getContext();
        ctx.fillStyle = '#f5f5f0';
        ctx.fillRect(0, 0, TEXTURE_WIDTH, textureHeight);

        // Replay all strokes in order using separate width/height
        state.strokes.forEach((stroke) => {
          if (stroke.points.length === 0) return;
          ctx.beginPath();
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.lineWidth;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          const firstPoint = stroke.points[0];
          ctx.moveTo(firstPoint.x * TEXTURE_WIDTH, firstPoint.y * textureHeight);
          for (let i = 1; i < stroke.points.length; i++) {
            const point = stroke.points[i];
            ctx.lineTo(point.x * TEXTURE_WIDTH, point.y * textureHeight);
          }
          ctx.stroke();
        });

        textureRef.current.update();

        // Force internal texture update
        const internalTexture = textureRef.current.getInternalTexture();
        if (internalTexture && typeof internalTexture.update === 'function') {
          internalTexture.update();
        }

        // Apply texture after updating (with delay to avoid race conditions)
        setTimeout(() => {
          applyTextureToMaterial();
        }, 50);
      } catch (error) {
        console.error('[Whiteboard] Error in whiteboard state subscription', error);
      }
    }, roomKey);

    return unsubscribe;
  }, [isInitialized, textureRef, applyTextureToMaterial]);

  // Apply texture when initialized
  useEffect(() => {
    if (isInitialized && whiteboardMesh && textureRef.current) {
      // Small delay to ensure everything is ready
      const timeout = setTimeout(() => {
        applyTextureToMaterial();
      }, 100);

      return () => clearTimeout(timeout);
    }
  }, [isInitialized, whiteboardMesh, textureRef, applyTextureToMaterial]);

  // Apply texture whenever drawing mode exits (after save)
  useEffect(() => {
    if (!drawingMode && isInitialized && whiteboardMesh && textureRef.current) {
      // Drawing mode just exited, apply the updated texture as a new asset
      // Use a small delay to ensure texture update completed
      const timeout = setTimeout(() => {
        applyTextureToMaterial();
        if (onTextureUpdated) {
          onTextureUpdated();
        }
      }, 250);

      return () => clearTimeout(timeout);
    }
  }, [drawingMode, isInitialized, whiteboardMesh, textureRef, applyTextureToMaterial, onTextureUpdated]);

  return null;
}


