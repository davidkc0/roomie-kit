import { useEffect, useRef } from 'react';
import {
    TransformNode,
    AbstractMesh,
    Vector3,
    MeshBuilder,
    StandardMaterial,
    DynamicTexture,
    Color3,
    Mesh
} from '@babylonjs/core';
import { useScene } from './scene';

type AvatarNameplateProps = {
    headNode: TransformNode | AbstractMesh | null;
    username: string;
    playerId: string;
    isMuted?: boolean;
    isSpeaking?: boolean;
    isLocal?: boolean;
    scale?: number; // Optional scale multiplier for zoomed-out cameras
};

export function AvatarNameplate({
    headNode,
    username,
    playerId,
    isMuted = false,
    isSpeaking = false,
    isLocal = false,
    scale = 1,
}: AvatarNameplateProps) {
    const { scene } = useScene();
    const planeRef = useRef<Mesh | null>(null);
    const textureRef = useRef<DynamicTexture | null>(null);

    useEffect(() => {
        if (!scene || !headNode) {
            return;
        }

        // Create a plane mesh for the nameplate
        // IMPORTANT: We do NOT parent it to the headNode.
        // avatar model bones/nodes often have complex local rotations/scales (e.g. mirrored)
        // that cause children to appear upside down, inverted, or at the feet (local Y down).
        // Instead, we create it in World Space and sync position in the render loop.
        const plane = MeshBuilder.CreatePlane(
            `nameplate_plane_${playerId}`,
            { width: 1.1 * scale, height: 0.3 * scale },
            scene
        );

        // billboardMode in World Space guarantees it faces camera upright
        plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
        plane.renderingGroupId = 1;
        plane.isPickable = false;

        // Create dynamic texture
        const textureWidth = 512;
        const textureHeight = 128; // Higher res
        // Note: invertY defaults to true, which is usually correct for DynamicTexture canvas
        const texture = new DynamicTexture(
            `nameplate_texture_${playerId}`,
            { width: textureWidth, height: textureHeight },
            scene,
            false
        );
        texture.hasAlpha = true;

        // Material
        const material = new StandardMaterial(`nameplate_mat_${playerId}`, scene);
        material.diffuseTexture = texture;
        material.specularColor = new Color3(0, 0, 0);
        material.emissiveColor = new Color3(1, 1, 1);
        material.backFaceCulling = false; // Ensure visibility from both sides (though billboard handles facing)
        material.useAlphaFromDiffuseTexture = true;
        material.disableLighting = true;
        plane.material = material;

        planeRef.current = plane;
        textureRef.current = texture;

        // Initial draw
        drawText(texture, username, isMuted, isSpeaking);

        // Render loop observer to follow head
        const observer = scene.onBeforeRenderObservable.add(() => {
            if (!plane || plane.isDisposed()) return;

            if (headNode.isDisposed()) {
                plane.dispose();
                return;
            }

            // Sync position to head in World Space
            // Always places it exactly above the head mesh, regardless of bone rotation/scale quirks
            const headPos = headNode.getAbsolutePosition();
            plane.position.copyFrom(headPos);
            plane.position.y += 0.55 * scale; // Offset scales with nameplate size
        });

        return () => {
            scene.onBeforeRenderObservable.remove(observer);
            if (planeRef.current) {
                planeRef.current.dispose();
                planeRef.current = null;
            }
            if (textureRef.current) {
                textureRef.current.dispose();
                textureRef.current = null;
            }
        };
    }, [scene, headNode, playerId]);

    // Update text
    useEffect(() => {
        if (textureRef.current) {
            drawText(textureRef.current, username, isMuted, isSpeaking);
        }
    }, [username, isMuted, isSpeaking]);

    return null;
}

function drawText(
    texture: DynamicTexture,
    username: string,
    isMuted: boolean,
    isSpeaking: boolean
) {
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D; // Cast to full context for text properties
    const width = texture.getSize().width;
    const height = texture.getSize().height;

    ctx.clearRect(0, 0, width, height);

    // Text settings
    // Use a nice bold font
    ctx.font = 'bold 48px "Segoe UI", Arial, sans-serif'; // Slightly smaller font
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let displayText = username || 'Player';
    let textColor = '#ffffff';

    if (isMuted) {
        displayText = `🔇 ${displayText}`;
        textColor = '#ff5555'; // Red for muted
    } else if (isSpeaking) {
        displayText = `🎤 ${displayText}`;
        textColor = '#55ff55'; // Green for speaking
    }

    // Stroke (Black Border)
    // Draw stroke BEFORE fill so the fill sits on top of the inner half of the stroke
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 6; // Thick border
    ctx.strokeText(displayText, width / 2, height / 2);

    // Fill (White Text)
    ctx.fillStyle = textColor;
    ctx.fillText(displayText, width / 2, height / 2);

    texture.update();
}
