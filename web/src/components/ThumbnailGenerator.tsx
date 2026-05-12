/**
 * Avatar Thumbnail Generator
 * 
 * A utility page that generates preview thumbnails for all avatar customization options.
 * Run this once locally, then upload the generated images to R2.
 * 
 * Access at: /avatar/thumbnails (add route in App.tsx if needed)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
    Engine,
    Scene,
    ArcRotateCamera,
    HemisphericLight,
    Vector3,
    Color4,
    Color3,
    DirectionalLight,
    Tools
} from '@babylonjs/core';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders';
import { resolveAssetUrl } from '../config/r2';
import { type AvatarConfig, applyAvatarTextures } from '../avatars/avatarTextures';

type ThumbnailType = 'outfit' | 'shoes' | 'skin' | 'hair' | 'costume';

interface ThumbnailJob {
    type: ThumbnailType;
    config: AvatarConfig;
    filename: string;
}

// Default config values for fields that aren't being varied
const BASE: AvatarConfig = { gender: 'male', skinTone: '1', outfit: '1', feet: '1', hairColor: '1', hair: '1' };

const COSTUMES = ['ninja', 'bear'];

// Generate all combinations we need thumbnails for
function generateJobs(): ThumbnailJob[] {
    const jobs: ThumbnailJob[] = [];

    // ---- OUTFITS ----
    // Male: 7 outfits, Female: 8 outfits
    for (let o = 1; o <= 7; o++) {
        jobs.push({ type: 'outfit', config: { ...BASE, gender: 'male', outfit: String(o) }, filename: `thumb_outfit_male_${o}.png` });
    }
    for (let o = 1; o <= 8; o++) {
        jobs.push({ type: 'outfit', config: { ...BASE, gender: 'female', outfit: String(o) }, filename: `thumb_outfit_female_${o}.png` });
    }

    // ---- SHOES ----
    // Male: 6 shoes (all standard), Female: 6 shoes (5 & 6 are sandals with skinTone)
    for (let f = 1; f <= 6; f++) {
        jobs.push({ type: 'shoes', config: { ...BASE, gender: 'male', feet: String(f) }, filename: `thumb_shoes_male_${f}.png` });
    }
    for (let f = 1; f <= 6; f++) {
        jobs.push({ type: 'shoes', config: { ...BASE, gender: 'female', feet: String(f) }, filename: `thumb_shoes_female_${f}.png` });
    }

    // ---- SKIN TONES ----
    for (const gender of ['male', 'female'] as const) {
        for (let st = 1; st <= 3; st++) {
            jobs.push({ type: 'skin', config: { ...BASE, gender, skinTone: String(st) }, filename: `thumb_skin_${gender}_${st}.png` });
        }
    }

    // ---- HAIRSTYLES ----
    for (const gender of ['male', 'female'] as const) {
        for (let h = 1; h <= 4; h++) {
            jobs.push({ type: 'hair', config: { ...BASE, gender, hair: String(h) }, filename: `thumb_hair_${gender}_${h}.png` });
        }
    }

    // ---- HAIR COLORS ----
    for (let hc = 1; hc <= 3; hc++) {
        jobs.push({ type: 'hair', config: { ...BASE, hairColor: String(hc) }, filename: `thumb_hairColor_${hc}.png` });
    }

    // ---- COSTUMES ----
    for (const costume of COSTUMES) {
        jobs.push({ type: 'costume', config: { ...BASE, costume }, filename: `thumb_costume_${costume}.png` });
    }

    return jobs;
}

export function ThumbnailGenerator() {
    const [status, setStatus] = useState<string>('Ready to generate');
    const [progress, setProgress] = useState<number>(0);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImages, setGeneratedImages] = useState<{ name: string; url: string }[]>([]);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Engine | null>(null);
    const sceneRef = useRef<Scene | null>(null);
    const meshesRef = useRef<any[]>([]);
    const cameraRef = useRef<ArcRotateCamera | null>(null);

    // Initialize Babylon scene
    useEffect(() => {
        if (!canvasRef.current) return;

        const engine = new Engine(canvasRef.current, true, { preserveDrawingBuffer: true });
        const scene = new Scene(engine);
        scene.clearColor = new Color4(0.1, 0.1, 0.15, 1);

        const camera = new ArcRotateCamera(
            'camera',
            -Math.PI / 2,
            Math.PI / 2,
            2.5,
            new Vector3(0, 1, 0),
            scene
        );
        camera.minZ = 0.1;

        const hemiLight = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
        hemiLight.intensity = 1.0;
        hemiLight.groundColor = new Color3(0.3, 0.3, 0.3);

        const dirLight = new DirectionalLight('dir', new Vector3(-1, -1, -1), scene);
        dirLight.intensity = 0.8;

        setStatus('Loading avatar model...');
        SceneLoader.ImportMeshAsync('', '', `${resolveAssetUrl('body3.glb', 'avatars')}?meshLod=2&t=${Date.now()}`, scene)
            .then((result) => {
                if (result.meshes[0]) {
                    result.meshes[0].position.y = 0;
                    result.meshes[0].rotationQuaternion = null;
                    result.meshes[0].rotation.x = -Math.PI / 2;
                }
                meshesRef.current = result.meshes;
                setStatus('Ready to generate thumbnails');
            })
            .catch((err) => {
                setStatus(`Error loading avatar: ${err.message}`);
            });

        engineRef.current = engine;
        sceneRef.current = scene;
        cameraRef.current = camera;

        engine.runRenderLoop(() => scene.render());

        return () => engine.dispose();
    }, []);

    // Position camera based on thumbnail type
    const positionCamera = useCallback((type: ThumbnailType) => {
        const camera = cameraRef.current;
        if (!camera) return;

        switch (type) {
            case 'outfit':
                camera.target = new Vector3(0, 1.0, 0);
                camera.radius = 1.8;
                camera.alpha = -Math.PI / 2;
                camera.beta = Math.PI / 2;
                break;
            case 'shoes':
                camera.target = new Vector3(0, 0.15, 0);
                camera.radius = 1.0;
                camera.alpha = -Math.PI / 2;
                camera.beta = Math.PI / 2.5;
                break;
            case 'skin':
                camera.target = new Vector3(0, 1.6, 0);
                camera.radius = 1.0;
                camera.alpha = -Math.PI / 2;
                camera.beta = Math.PI / 2;
                break;
            case 'hair':
                // 3/4 angle head shot so hair style is visible from the side
                camera.target = new Vector3(0, 1.4, 0);
                camera.radius = 1.5;
                camera.alpha = -Math.PI / 2 + 0.6; // rotated ~35° for 3/4 view
                camera.beta = Math.PI / 2.1;
                break;
            case 'costume':
                // Full body
                camera.target = new Vector3(0, 0.8, 0);
                camera.radius = 3.2;
                camera.alpha = -Math.PI / 2;
                camera.beta = Math.PI / 2;
                break;
        }
    }, []);

    // Generate all thumbnails
    const generateThumbnails = useCallback(async () => {
        if (!sceneRef.current || !engineRef.current || meshesRef.current.length === 0) {
            setStatus('Scene not ready');
            return;
        }

        setIsGenerating(true);
        setGeneratedImages([]);

        const jobs = generateJobs().filter(j => j.filename.startsWith('thumb_hair_')); // TEMP: all hair thumbs
        const images: { name: string; url: string }[] = [];

        for (let i = 0; i < jobs.length; i++) {
            const job = jobs[i];
            setStatus(`Generating ${job.filename} (${i + 1}/${jobs.length})`);
            setProgress(((i + 1) / jobs.length) * 100);

            // Apply textures
            applyAvatarTextures(meshesRef.current, job.config, sceneRef.current);

            // Position camera for this type
            positionCamera(job.type);

            // Wait for textures to download — hair/costume load new head textures that aren't cached
            const waitMs = (job.type === 'hair' || job.type === 'costume') ? 800 : 400;
            await new Promise(resolve => setTimeout(resolve, waitMs));
            sceneRef.current.render();
            await new Promise(resolve => setTimeout(resolve, 200));

            // Capture screenshot
            const dataUrl = await Tools.CreateScreenshotAsync(
                engineRef.current,
                cameraRef.current!,
                { width: 256, height: 256 }
            );

            images.push({ name: job.filename, url: dataUrl });
        }

        setGeneratedImages(images);
        setStatus(`Done! Generated ${images.length} thumbnails`);
        setIsGenerating(false);
    }, [positionCamera]);

    // Download all images as individual files
    const downloadAll = useCallback(() => {
        generatedImages.forEach((img, index) => {
            setTimeout(() => {
                const link = document.createElement('a');
                link.href = img.url;
                link.download = img.name;
                link.click();
            }, index * 100);
        });
    }, [generatedImages]);

    const totalJobs = generateJobs().length;

    return (
        <div className="fixed inset-0 bg-brand-bg z-50 flex flex-col p-4">
            <h1 className="text-2xl font-bold text-white mb-4">Avatar Thumbnail Generator</h1>

            <div className="flex gap-4 mb-4 items-center flex-wrap">
                <button
                    onClick={generateThumbnails}
                    disabled={isGenerating}
                    className="px-4 py-2 bg-brand-primary text-black font-bold rounded-lg disabled:opacity-50"
                >
                    {isGenerating ? 'Generating...' : `Generate All (${totalJobs})`}
                </button>

                {generatedImages.length > 0 && (
                    <button
                        onClick={downloadAll}
                        className="px-4 py-2 bg-green-500 text-black font-bold rounded-lg"
                    >
                        Download All ({generatedImages.length})
                    </button>
                )}

                <span className="text-xs text-slate-500">
                    7M+8F outfits · 6+6 shoes · 3+3 skin · 5+5 hair · 3 colors · {COSTUMES.length} costumes
                </span>
            </div>

            <div className="mb-4">
                <div className="text-slate-400 text-sm mb-2">{status}</div>
                {isGenerating && (
                    <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                            className="bg-brand-primary h-2 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                )}
            </div>

            <div className="flex gap-4 flex-1 min-h-0">
                <div className="w-64 h-64 bg-black rounded-lg overflow-hidden flex-shrink-0">
                    <canvas ref={canvasRef} className="w-full h-full" />
                </div>

                <div className="flex-1 overflow-y-auto">
                    <div className="grid grid-cols-8 gap-2">
                        {generatedImages.map((img) => (
                            <div key={img.name} className="flex flex-col items-center">
                                <img
                                    src={img.url}
                                    alt={img.name}
                                    className="w-16 h-16 rounded border border-white/10"
                                />
                                <span className="text-[8px] text-slate-500 mt-1 truncate w-full text-center">
                                    {img.name.replace('thumb_', '').replace('.png', '')}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
