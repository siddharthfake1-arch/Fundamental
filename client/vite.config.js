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
        // Function form (compatible with Rollup and Vite 8's Rolldown bundler).
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](react-router|react-router-dom|react-dom|react|scheduler)[\\/]/.test(id)) return 'react-vendor';
          if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) return 'motion';
          if (id.includes('lucide-react')) return 'icons';
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
