#!/usr/bin/env node

/**
 * Script to download MediaPipe Face Landmarker model and WASM files
 * Run with: node scripts/download-mediapipe.js
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEDIAPIPE_DIR = path.join(__dirname, '../public/mediapipe');
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// WASM files from node_modules
const WASM_SOURCE_DIR = path.join(__dirname, '../node_modules/@mediapipe/tasks-vision/wasm');

const filesToCopy = [
  'vision_wasm_internal.wasm',
  'vision_wasm_internal.js',
  'vision_wasm_nosimd_internal.wasm',
  'vision_wasm_nosimd_internal.js',
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    console.log(`Downloading ${url}...`);
    
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`✓ Downloaded ${path.basename(dest)}`);
          resolve();
        });
      } else if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        file.close();
        fs.unlinkSync(dest);
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      } else {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
      }
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) {
        fs.unlinkSync(dest);
      }
      reject(err);
    });
  });
}

function copyFile(src, dest) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(src)) {
      reject(new Error(`Source file not found: ${src}`));
      return;
    }
    
    fs.copyFile(src, dest, (err) => {
      if (err) {
        reject(err);
      } else {
        console.log(`✓ Copied ${path.basename(dest)}`);
        resolve();
      }
    });
  });
}

async function main() {
  console.log('Setting up MediaPipe files...\n');
  
  ensureDir(MEDIAPIPE_DIR);
  
  // Download model file
  const modelPath = path.join(MEDIAPIPE_DIR, 'face_landmarker.task');
  if (fs.existsSync(modelPath)) {
    console.log(`⚠ Model file already exists: ${modelPath}`);
    console.log('  Delete it first if you want to re-download.\n');
  } else {
    try {
      await downloadFile(MODEL_URL, modelPath);
    } catch (error) {
      console.error(`✗ Failed to download model: ${error.message}`);
      process.exit(1);
    }
  }
  
  // Copy WASM files
  console.log('\nCopying WASM files...');
  for (const filename of filesToCopy) {
    const src = path.join(WASM_SOURCE_DIR, filename);
    const dest = path.join(MEDIAPIPE_DIR, filename);
    
    if (fs.existsSync(dest)) {
      console.log(`⚠ ${filename} already exists, skipping...`);
      continue;
    }
    
    try {
      await copyFile(src, dest);
    } catch (error) {
      console.error(`✗ Failed to copy ${filename}: ${error.message}`);
      process.exit(1);
    }
  }
  
  console.log('\n✓ MediaPipe setup complete!');
  console.log(`  Files are in: ${MEDIAPIPE_DIR}`);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});




