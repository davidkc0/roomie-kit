import '@babylonjs/core/Loading/loadingScreen';

import {
  ArcRotateCamera,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  Color3,
  Color4,
  Texture,
} from '@babylonjs/core';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';

const CAMERA_ALPHA = Math.PI / 2;
const CAMERA_BETA = Math.PI / 3;  // ~60° from vertical — standard third-person angle
const CAMERA_RADIUS = 4;

type SceneContextValue = {
  engine: Engine;
  scene: Scene;
  canvas: HTMLCanvasElement;
  camera: ArcRotateCamera;
};

const SceneContext = createContext<SceneContextValue | null>(null);

export const useScene = () => {
  const value = useContext(SceneContext);
  if (!value) {
    throw new Error('useScene must be used inside a <SceneRoot>');
  }
  return value;
};

const useBabylon = ({ paused, hideGround = false }: { paused: boolean; hideGround?: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const [camera, setCamera] = useState<ArcRotateCamera | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const engineInstance = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      powerPreference: 'default',
    });

    // Fix collision jitter - reduce throw-back distance
    Engine.CollisionsEpsilon = 0.00001;

    const sceneInstance = new Scene(engineInstance);
    sceneInstance.collisionsEnabled = true;
    // NOTE: Do NOT set useRightHandedSystem - it breaks checkCollisions with GLB meshes
    // The GLTF loader handles coordinate system conversion internally
    sceneInstance.gravity = new Vector3(0, -0.9, 0);
    // Make scene transparent so CSS gradient sky shows through
    sceneInstance.clearColor = new Color4(0, 0, 0, 0);

    const camera = new ArcRotateCamera(
      'camera',
      CAMERA_ALPHA,
      CAMERA_BETA,
      CAMERA_RADIUS,
      new Vector3(0, 1, 0),
      sceneInstance
    );
    camera.attachControl(canvas, true);
    camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
    camera.minZ = 0.1;
    camera.lowerBetaLimit = 0.6;  // ~35° — prevents camera from going overhead
    camera.upperBetaLimit = Math.PI / 2.1;  // ~86° — prevents looking from below
    camera.panningSensibility = 0;
    camera.checkCollisions = false;
    // camera.collisionRadius = new Vector3(0.5, 0.5, 0.5); // Disabled for performance
    cameraRef.current = camera;
    setCamera(camera);

    // Primary ambient light (from above) - main illumination
    const skyLight = new HemisphericLight('skyLight', new Vector3(0, 1, 0), sceneInstance);
    skyLight.intensity = 1.0;
    skyLight.specular = new Color3(0, 0, 0); // No specular = no glare

    // Ground bounce light (from below) - fills shadows for even lighting
    const groundLight = new HemisphericLight('groundLight', new Vector3(0, -1, 0), sceneInstance);
    groundLight.intensity = 0.4;
    groundLight.specular = new Color3(0, 0, 0);

    // Create ground only if not hidden
    if (!hideGround) {
      const ground = MeshBuilder.CreateGround(
        'ground',
        { width: 20, height: 20 },
        sceneInstance
      );
      const groundMaterial = new StandardMaterial('ground-mat', sceneInstance);
      groundMaterial.diffuseColor = new Color3(0.4, 0.3, 0.2); // Warm wood tone
      groundMaterial.specularColor = new Color3(0, 0, 0); // No specular = no glare on floor
      const woodTexture = new Texture(
        '/wood_floor_worn_diff_4k.jpg',
        sceneInstance
      );
      woodTexture.uScale = 4; // Adjust based on your texture - lower = larger tiles
      woodTexture.vScale = 4;
      groundMaterial.diffuseTexture = woodTexture;
      ground.material = groundMaterial;
      ground.checkCollisions = true;
    }



    setEngine(engineInstance);
    setScene(sceneInstance);

    // Expose scene globally for proximity detection (used in Room.tsx)
    (window as any).__babylonScene = sceneInstance;

    const resize = () => {
      engineInstance.resize();
    };

    // iOS requires orientationchange listener with delay
    const handleOrientationChange = () => {
      // Wait for iOS to complete rotation animation
      setTimeout(() => {
        engineInstance.resize();
      }, 100);
    };

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', handleOrientationChange);

    // Also listen to visualViewport resize for iOS
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', resize);
    }

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', resize);
      }
      engineInstance.stopRenderLoop();
      sceneInstance.dispose();
      engineInstance.dispose();
      cameraRef.current = null;
      setCamera(null);
    };
  }, []);

  // Handle pause/resume
  useEffect(() => {
    if (!engine || !scene) return;

    if (paused) {
      engine.stopRenderLoop();
    } else {
      engine.runRenderLoop(() => {
        scene.render();
      });
    }

    // Cleanup ensuring we don't duplicate loops, though stopRenderLoop handles it
    return () => {
      engine.stopRenderLoop();
    };
  }, [engine, scene, paused]);

  return { canvasRef, engine, scene, camera };
};

type SceneRootProps = PropsWithChildren<{
  paused?: boolean;
  hideGround?: boolean;
}>;

export function SceneRoot({ children, paused = false, hideGround = false }: SceneRootProps) {
  const { canvasRef, engine, scene, camera } = useBabylon({ paused, hideGround });
  const contextValue = useMemo(() => {
    if (!engine || !scene || !canvasRef.current || !camera) {
      return null;
    }
    return {
      engine,
      scene,
      canvas: canvasRef.current,
      camera,
    };
  }, [engine, scene, camera, canvasRef]);

  return (
    <div className="relative h-full w-full">
      {/* Roblox-style gradient sky background */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: 'linear-gradient(to bottom, #2C67F2 0%, #62CFF4 60%, #87CEEB 100%)'
        }}
      />
      <canvas ref={canvasRef} className="block h-full w-full" style={{ touchAction: 'none' }} />
      {contextValue ? (
        <SceneContext.Provider value={contextValue}>
          {children}
        </SceneContext.Provider>
      ) : null}
    </div>
  );
}
