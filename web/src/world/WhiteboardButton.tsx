import { useEffect, useRef } from 'react';
import { useScene } from './scene';
import {
  MeshBuilder,
  StandardMaterial,
  Vector3,
  AbstractMesh,
  ActionManager,
  ExecuteCodeAction,
} from '@babylonjs/core';

type WhiteboardButtonProps = {
  whiteboardMesh: AbstractMesh | null;
  onToggleDrawingMode: () => void;
  isDrawingMode: boolean;
};

export function WhiteboardButton({ whiteboardMesh, onToggleDrawingMode, isDrawingMode }: WhiteboardButtonProps) {
  const { scene } = useScene();
  const buttonRef = useRef<AbstractMesh | null>(null);
  const toggleCallbackRef = useRef(onToggleDrawingMode);

  // Update callback ref when it changes
  useEffect(() => {
    toggleCallbackRef.current = onToggleDrawingMode;
  }, [onToggleDrawingMode]);

  useEffect(() => {
    if (!whiteboardMesh) return;

    // Check if button already exists in scene
    const existingButton = scene.getMeshByName('whiteboardButton');
    if (existingButton) {
      buttonRef.current = existingButton as AbstractMesh;
      return;
    }

    // Create button mesh - small box positioned on the whiteboard
    const button = MeshBuilder.CreateBox(
      'whiteboardButton',
      { width: 0.8, height: 0.4, depth: 0.1 },
      scene
    );

    // Position button on the whiteboard (slightly in front, top-right area)
    // Position button relative to the whiteboard mesh
    // Access bounding box to determine size
    whiteboardMesh.computeWorldMatrix(true);
    const boundingBox = whiteboardMesh.getBoundingInfo().boundingBox;
    const width = boundingBox.maximumWorld.x - boundingBox.minimumWorld.x;
    const height = boundingBox.maximumWorld.y - boundingBox.minimumWorld.y;

    // Position at top-right corner of the whiteboard
    // We can parent it to the whiteboard mesh for easier relative positioning
    button.parent = whiteboardMesh;

    // Local position (assuming whiteboard center is 0,0,0 locally)
    // Offset slightly forward (-0.1 in local Z usually implies front specific to plane orientation, but standard Box is centered)
    // If whiteboard is a Box (depth 0.2), front face is at -0.1 or +0.1 depending on rotation.
    // Let's try placing it relative to the mesh.

    // For a 15x4 wall:
    // x = width/2 - 1 (1m from right edge)
    // y = height/2 - 0.5 (0.5m from top edge)
    // z = -0.15 (slightly in front of the 0.2 depth wall)

    button.position = new Vector3(width / 2 - 1.5, height / 2 - 0.8, -0.15);
    button.rotation = new Vector3(0, 0, 0); // Inherit rotation from wall

    // Create material for button
    const buttonMaterial = new StandardMaterial('whiteboardButtonMaterial', scene);
    buttonMaterial.diffuseColor = isDrawingMode
      ? { r: 0.8, g: 0.2, b: 0.2, a: 1 } as any // Red when in drawing mode
      : { r: 0.2, g: 0.6, b: 0.9, a: 1 } as any; // Blue when not in drawing mode
    buttonMaterial.emissiveColor = isDrawingMode
      ? { r: 0.8, g: 0.2, b: 0.2, a: 1 } as any
      : { r: 0.2, g: 0.6, b: 0.9, a: 1 } as any;
    buttonMaterial.disableLighting = true;
    button.material = buttonMaterial;

    // Enable picking
    button.isPickable = true;

    // Add action manager for click detection
    button.actionManager = new ActionManager(scene);

    // Add click action - use OnPickDownTrigger for better reliability
    button.actionManager.registerAction(
      new ExecuteCodeAction(
        ActionManager.OnPickDownTrigger,
        (evt) => {
          evt.sourceEvent?.stopPropagation?.();
          evt.sourceEvent?.preventDefault?.();
          toggleCallbackRef.current();
        }
      )
    );

    buttonRef.current = button;

    return () => {
      // Don't dispose on cleanup - let it persist
      // Only dispose if component unmounts completely
    };
  }, [scene, whiteboardMesh]);

  // Update button color when drawing mode changes
  useEffect(() => {
    if (!buttonRef.current || !buttonRef.current.material) return;

    const material = buttonRef.current.material as StandardMaterial;
    if (isDrawingMode) {
      material.diffuseColor = { r: 0.8, g: 0.2, b: 0.2, a: 1 } as any; // Red
      material.emissiveColor = { r: 0.8, g: 0.2, b: 0.2, a: 1 } as any;
    } else {
      material.diffuseColor = { r: 0.2, g: 0.6, b: 0.9, a: 1 } as any; // Blue
      material.emissiveColor = { r: 0.2, g: 0.6, b: 0.9, a: 1 } as any;
    }
    // material.markAsDirty(); // Removed to fix lint error (property updates auto-trigger)
  }, [isDrawingMode]);

  return null;
}



