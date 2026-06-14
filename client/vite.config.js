import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
  build: {
    // Split heavy third-party libraries out of the app bundle so no single
    // chunk trips the size warning and the browser can cache vendors separately.
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'motion': ['motion'],
          'icons': ['lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
