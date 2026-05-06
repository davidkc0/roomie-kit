import { useEffect, useRef } from 'react';
import { MeshBuilder, Vector3, Mesh, StandardMaterial, Color3 } from '@babylonjs/core';
import { useScene } from './scene';

type CollisionBoxProps = {
    position: Vector3;
    size: Vector3;
    name: string;
    debug?: boolean; // If true, shows box as semi-transparent for debugging
};

/**
 * Invisible collision box that prevents players from walking through an area.
 * Use this around complex geometry that has collision gaps.
 */
export function CollisionBox({ position, size, name, debug = false }: CollisionBoxProps) {
    const { scene } = useScene();
    const boxRef = useRef<Mesh | null>(null);

    useEffect(() => {
        if (!scene) return;

        // Create box mesh
        const box = MeshBuilder.CreateBox(
            `collision_${name}`,
            { width: size.x, height: size.y, depth: size.z },
            scene
        );
        box.position = position.clone();
        box.checkCollisions = true;
        box.isPickable = false;

        if (debug) {
            // Debug mode: show as semi-transparent red box
            const mat = new StandardMaterial(`collision_${name}_mat`, scene);
            mat.diffuseColor = new Color3(1, 0, 0);
            mat.alpha = 0.3;
            box.material = mat;
        } else {
            // Production: completely invisible
            box.visibility = 0;
        }

        boxRef.current = box;
        console.log(`[CollisionBox] Created ${name} at`, position, 'size:', size);

        return () => {
            if (boxRef.current && !boxRef.current.isDisposed()) {
                boxRef.current.dispose();
                boxRef.current = null;
                console.log(`[CollisionBox] Disposed ${name}`);
            }
        };
    }, [scene, position.x, position.y, position.z, size.x, size.y, size.z, name, debug]);

    return null;
}
