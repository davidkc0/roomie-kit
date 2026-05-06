import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

function manualChunks(id: string): string | undefined {
  if (!id.includes('/node_modules/')) return undefined

  if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router') || id.includes('/react-router-dom/')) {
    return 'vendor-react'
  }

  if (id.includes('/@babylonjs/')) return 'vendor-babylon'
  if (id.includes('/agora-rtc-sdk-ng/')) return 'vendor-agora'
  if (id.includes('/@supabase/')) return 'vendor-supabase'
  if (id.includes('/@capacitor/') || id.includes('/@capacitor-community/') || id.includes('/@ionic/') || id.includes('/onesignal-cordova-plugin/')) {
    return 'vendor-native'
  }
  if (id.includes('/@mediapipe/') || id.includes('/@rive-app/')) return 'vendor-avatar'
  if (id.includes('/chess.js/') || id.includes('/react-chessboard/') || id.includes('/playroomkit/')) return 'vendor-games'
  if (id.includes('/lucide-react/')) return 'vendor-icons'

  return 'vendor'
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    nodePolyfills({
      protocolImports: true,
    }),
    react(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      'react': 'react',
      'react-dom': 'react-dom',
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'agora-rtc-sdk-ng', 'agora-token'],
    esbuildOptions: {
      define: {
        global: 'globalThis'
      },
    }
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
        manualChunks,
      },
    },
  },
})
