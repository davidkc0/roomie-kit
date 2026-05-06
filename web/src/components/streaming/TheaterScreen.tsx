import { useEffect, useRef } from 'react';
import { useScene } from '../../world/scene';
import { VideoTexture, PBRMaterial, Color3 } from '@babylonjs/core';

type TheaterScreenProps = {
    streamerId: string | null;
    videoElement: HTMLVideoElement | null;
    screenMeshName?: string;
};

/**
 * TheaterScreen binds a video element to the theater screen mesh in 3D space.
 * When a streamer is active, their video is displayed on the "Screen" mesh.
 */
export function TheaterScreen({
    streamerId,
    videoElement,
    screenMeshName = 'Screen'
}: TheaterScreenProps) {
    const { scene } = useScene();
    const materialRef = useRef<PBRMaterial | null>(null);
    const textureRef = useRef<VideoTexture | null>(null);

    useEffect(() => {
        if (!scene) return;

        // Find the screen mesh in the theater
        // Try exact name, then lowercase, then "Screen" default
        let screenMesh = scene.getMeshByName(screenMeshName);
        if (!screenMesh) {
            screenMesh = scene.getMeshByName(screenMeshName.toLowerCase());
        }
        if (!screenMesh) {
            screenMesh = scene.getMeshByName("Screen");
        }

        if (!screenMesh) {
            console.warn(`[TheaterScreen] Screen mesh "${screenMeshName}" (or variants) not found`);
            return;
        }

        // If no streamer or video, show black/idle screen
        if (!streamerId || !videoElement) {
            // Create or update idle material
            if (!materialRef.current) {
                materialRef.current = new PBRMaterial('theater-screen-mat', scene);
                materialRef.current.unlit = true;
                materialRef.current.emissiveColor = new Color3(0.05, 0.05, 0.08); // Dark blue-ish
                screenMesh.material = materialRef.current;
            } else {
                materialRef.current.emissiveColor = new Color3(0.05, 0.05, 0.08);
                if (materialRef.current.emissiveTexture) {
                    materialRef.current.emissiveTexture.dispose();
                    materialRef.current.emissiveTexture = null;
                }
            }

            // Dispose old video texture
            if (textureRef.current) {
                textureRef.current.dispose();
                textureRef.current = null;
            }

            return;
        }

        // Function to create and bind the video texture
        const bindVideoTexture = () => {
            console.log(`[TheaterScreen] Creating video texture for streamer ${streamerId}`);

            // Dispose old texture if exists
            if (textureRef.current) {
                textureRef.current.dispose();
                textureRef.current = null;
            }

            // Match Avatar.tsx VideoTexture setup exactly
            const videoTexture = new VideoTexture(
                `theater-video-${streamerId}`,
                videoElement,
                scene,
                true   // generateMipMaps - same as Avatar.tsx
            );
            // Flip the video vertically (it's upside-down otherwise)
            videoTexture.vScale = -1;
            textureRef.current = videoTexture;

            // Create material if needed - matching Avatar.tsx PBR setup
            if (!materialRef.current) {
                materialRef.current = new PBRMaterial('theater-screen-mat', scene);
                materialRef.current.unlit = true;
            }

            // Set BOTH albedo and emissive - exactly like Avatar.tsx
            materialRef.current.albedoColor = new Color3(1, 1, 1);
            materialRef.current.emissiveColor = new Color3(1, 1, 1);
            materialRef.current.albedoTexture = videoTexture;
            materialRef.current.emissiveTexture = videoTexture;
            screenMesh.material = materialRef.current;

            console.log('[TheaterScreen] Video bound to screen mesh');
        };

        // Check if video is ready (has frame data)
        // readyState >= 2 means HAVE_CURRENT_DATA or better
        if (videoElement.readyState >= 2) {
            console.log(`[TheaterScreen] Video already ready (readyState: ${videoElement.readyState})`);
            bindVideoTexture();
        } else {
            console.log(`[TheaterScreen] Waiting for video to be ready (readyState: ${videoElement.readyState})`);

            const onCanPlay = () => {
                console.log(`[TheaterScreen] Video now ready via canplay event`);
                videoElement.removeEventListener('canplay', onCanPlay);
                videoElement.removeEventListener('loadeddata', onCanPlay);
                bindVideoTexture();
            };

            // Listen for both events to cover different scenarios
            videoElement.addEventListener('canplay', onCanPlay);
            videoElement.addEventListener('loadeddata', onCanPlay);

            return () => {
                videoElement.removeEventListener('canplay', onCanPlay);
                videoElement.removeEventListener('loadeddata', onCanPlay);
                if (textureRef.current) {
                    textureRef.current.dispose();
                    textureRef.current = null;
                }
            };
        }

        return () => {
            if (textureRef.current) {
                textureRef.current.dispose();
                textureRef.current = null;
            }
        };
    }, [scene, streamerId, videoElement, screenMeshName]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (textureRef.current) {
                textureRef.current.dispose();
            }
            if (materialRef.current) {
                materialRef.current.dispose();
            }
        };
    }, []);

    return null; // This is a scene-binding component, no DOM output
}
