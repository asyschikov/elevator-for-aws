import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';

export default defineConfig({
  plugins: [
    react(),
    svgr(),
  ],
  resolve: {
    alias: {
      // Handle Node.js built-in modules for Amplify
      './runtimeConfig': './runtimeConfig.browser',
    },
  },
  define: {
    // Fix for Amplify and other libs that expect process.env
    'process.env': {},
    global: 'globalThis',
  },
  build: {
    outDir: 'build',
  },
  server: {
    port: 3000,
  },
});
