import { useEffect, useRef, useMemo, useState } from 'react';
import { ActionManager, ExecuteCodeAction, Vector3, AbstractMesh, Quaternion } from '@babylonjs/core';
import { useScene } from './scene';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders';

type FurnitureProps = {
  modelPath: string;
  modelName: string;
  position: Vector3;
  rotation?: Vector3;
  scale?: Vector3;
  isEditable?: boolean;
  onSelect?: () => void;
};

export function Furniture({
  modelPath,
  modelName,
  position,
  rotation = Vector3.Zero(),
  scale = new Vector3(1, 1, 1),
  isEditable = false,
  onSelect
}: FurnitureProps) {
  const { scene } = useScene();
  const loadedMeshesRef = useRef<AbstractMesh[]>([]);
  const nativeQuatRef = useRef<Quaternion>(Quaternion.Identity());
  const [meshesLoaded, setMeshesLoaded] = useState(false);

  // Memoize Vector3 values to prevent infinite re-renders
  const positionKey = useMemo(() => `${position.x},${position.y},${position.z}`, [position.x, position.y, position.z]);
  const rotationKey = useMemo(() => `${rotation.x},${rotation.y},${rotation.z}`, [rotation.x, rotation.y, rotation.z]);
  const scaleKey = useMemo(() => `${scale.x},${scale.y},${scale.z}`, [scale.x, scale.y, scale.z]);

  useEffect(() => {
    if (!scene) return;

    let disposed = false;
    setMeshesLoaded(false);

    (async () => {
      try {
        console.log(`[Furniture] Loading ${modelName} from ${modelPath}`);

        const result = await SceneLoader.ImportMeshAsync(
          '', // Load all meshes
          modelPath,
          undefined, // filename is included in modelPath
          scene
        );

        if (disposed) {
          result.meshes.forEach(mesh => mesh.dispose());
          return;
        }

        console.log(`[Furniture] Loaded ${result.meshes.length} meshes for ${modelName}`);

        const rootMesh = result.meshes[0];
        if (rootMesh) {
          rootMesh.name = modelName;
          rootMesh.id = modelName;
          rootMesh.position = position.clone();

          // Capture native rotation from GLB loader (coordinate system conversion)
          // BEFORE we overwrite it — we need to compose user rotation on top
          const nativeQuat = rootMesh.rotationQuaternion
            ? rootMesh.rotationQuaternion.clone()
            : Quaternion.FromEulerAngles(rootMesh.rotation.x, rootMesh.rotation.y, rootMesh.rotation.z);
          nativeQuatRef.current = nativeQuat;

          // Compose: user rotation * native rotation (preserves coordinate conversion)
          const userQuat = Quaternion.FromEulerAngles(rotation.x, rotation.y, rotation.z);
          rootMesh.rotationQuaternion = userQuat.multiply(nativeQuat);

          rootMesh.checkCollisions = true;
          rootMesh.renderingGroupId = 0;

          const materialPromises: Promise<any>[] = [];
          result.meshes.forEach(mesh => {
            mesh.renderingGroupId = 0;
            if (mesh.material) {
              const material = mesh.material as any;
              material.zOffset = 1.5;
              material.backFaceCulling = false;
              material.needDepthPrePass = true;
              material.disableDepthWrite = false;
              material.markAsDirty();
              if (material.forceCompilationAsync) {
                materialPromises.push(
                  material.forceCompilationAsync(mesh).catch((err: any) => {
                    console.warn(`[Furniture] Shader compilation warning:`, err);
                  })
                );
              }
            }
          });

          await Promise.all(materialPromises);

          loadedMeshesRef.current = result.meshes;
          setMeshesLoaded(true); // Trigger re-render so interaction effect runs

          console.log(`[Furniture] Positioned ${modelName} at`, position);
        }
      } catch (error) {
        console.error(`[Furniture] Failed to load ${modelName}:`, error);
      }
    })();

    return () => {
      disposed = true;
      loadedMeshesRef.current.forEach(mesh => {
        if (mesh && !mesh.isDisposed()) {
          mesh.dispose();
        }
      });
      loadedMeshesRef.current = [];
      setMeshesLoaded(false);
      console.log(`[Furniture] 🧹 Unmounted/Disposed ${modelName}`);
    };
  }, [scene, modelPath, modelName, positionKey, rotationKey, scaleKey]);

  // Separate effect to update position/rotation/scale when they change (without reloading)
  useEffect(() => {
    if (loadedMeshesRef.current.length === 0) return;

    const rootMesh = loadedMeshesRef.current[0];
    if (rootMesh && !rootMesh.isDisposed()) {
      rootMesh.position.copyFrom(position);
      const userQuat = Quaternion.FromEulerAngles(rotation.x, rotation.y, rotation.z);
      rootMesh.rotationQuaternion = userQuat.multiply(nativeQuatRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionKey, rotationKey, scaleKey]);

  // Interaction effect — runs when meshes are loaded OR isEditable changes
  useEffect(() => {
    const meshes = loadedMeshesRef.current;
    if (!scene || meshes.length === 0 || !meshesLoaded) return;

    meshes.forEach(mesh => {
      if (!mesh || mesh.isDisposed()) return;

      mesh.isPickable = !!isEditable;

      if (isEditable && onSelect) {
        if (!mesh.actionManager) mesh.actionManager = new ActionManager(scene);
        mesh.actionManager.actions = [];

        mesh.actionManager.registerAction(
          new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
            console.log(`[Furniture] Selected ${modelName}`);
            onSelect();
          })
        );
      } else {
        if (mesh.actionManager) {
          mesh.actionManager.actions = [];
        }
      }
    });
  }, [isEditable, onSelect, scene, modelName, meshesLoaded]);

  return null;
}
