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

type ArcadeButtonProps = {
  onToggleGame: () => void;
  isGameMode: boolean;
};

export function ArcadeButton({ onToggleGame, isGameMode }: ArcadeButtonProps) {
  const { scene } = useScene();
  const buttonRef = useRef<AbstractMesh | null>(null);
  const toggleCallbackRef = useRef(onToggleGame);
  
  // Update callback ref when it changes
  useEffect(() => {
    toggleCallbackRef.current = onToggleGame;
  }, [onToggleGame]);

  useEffect(() => {
    if (!scene) return;
    
    // Check if button already exists in scene
    const existingButton = scene.getMeshByName('arcadeButton');
    if (existingButton) {
      buttonRef.current = existingButton as AbstractMesh;
      return;
    }

    // Create button mesh - small box positioned above arcade cabinet
    const button = MeshBuilder.CreateBox(
      'arcadeButton',
      { width: 1.2, height: 0.5, depth: 0.1 },
      scene
    );
    
    // Position button above arcade cabinet (cabinet is at z=8, position button at z=7.5, height y=3.5 - higher)
    button.position = new Vector3(0, 3.5, 7.5);
    
    // Create material for button
    const buttonMaterial = new StandardMaterial('arcadeButtonMaterial', scene);
    buttonMaterial.diffuseColor = isGameMode 
      ? { r: 0.2, g: 0.8, b: 0.2, a: 1 } as any // Green when active
      : { r: 0.8, g: 0.2, b: 0.2, a: 1 } as any; // Red when inactive
    buttonMaterial.emissiveColor = isGameMode
      ? { r: 0.1, g: 0.4, b: 0.1, a: 1 } as any
      : { r: 0.4, g: 0.1, b: 0.1, a: 1 } as any;
    buttonMaterial.specularColor = { r: 0.5, g: 0.5, b: 0.5, a: 1 } as any;
    button.material = buttonMaterial;
    
    // Make button pickable
    button.isPickable = true;
    
    // Add action manager for click interaction
    const actionManager = new ActionManager(scene);
    button.actionManager = actionManager;
    
    // Add click action - use OnPickDownTrigger for better reliability
    actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickDownTrigger, (evt) => {
        evt.sourceEvent?.stopPropagation?.();
        evt.sourceEvent?.preventDefault?.();
        console.log('[ArcadeButton] Button clicked');
        toggleCallbackRef.current();
      })
    );
    
    // Add hover effect
    actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, () => {
        if (button.material) {
          const mat = button.material as StandardMaterial;
          mat.emissiveColor = isGameMode
            ? { r: 0.2, g: 0.6, b: 0.2, a: 1 } as any
            : { r: 0.6, g: 0.2, b: 0.2, a: 1 } as any;
        }
        // Scale up slightly on hover
        button.scaling = new Vector3(1.1, 1.1, 1.1);
      })
    );
    
    actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, () => {
        if (button.material) {
          const mat = button.material as StandardMaterial;
          mat.emissiveColor = isGameMode
            ? { r: 0.1, g: 0.4, b: 0.1, a: 1 } as any
            : { r: 0.4, g: 0.1, b: 0.1, a: 1 } as any;
        }
        // Reset scale
        button.scaling = new Vector3(1, 1, 1);
      })
    );
    
    buttonRef.current = button;
    
    console.log('[ArcadeButton] Created button at position', button.position);
    
    return () => {
      if (button && !button.isDisposed()) {
        button.dispose();
      }
    };
  }, [scene, isGameMode]);

  // Update button appearance when game mode changes
  useEffect(() => {
    if (!buttonRef.current || !scene) return;
    
    const button = buttonRef.current;
    if (button.material) {
      const mat = button.material as StandardMaterial;
      mat.diffuseColor = isGameMode
        ? { r: 0.2, g: 0.8, b: 0.2, a: 1 } as any
        : { r: 0.8, g: 0.2, b: 0.2, a: 1 } as any;
      mat.emissiveColor = isGameMode
        ? { r: 0.1, g: 0.4, b: 0.1, a: 1 } as any
        : { r: 0.4, g: 0.1, b: 0.1, a: 1 } as any;
    }
  }, [isGameMode, scene]);

  return null;
}



