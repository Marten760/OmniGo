import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'; // استيراد وحدة 'path' للتعامل مع مسارات الملفات

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'localhost',
      'unwishfully-uneclipsing-shay.ngrok-free.dev'
    ],
    fs: {
      allow: ['..']
    }
  },
  build: {
    sourcemap: false, // Disable sourcemaps for production builds
  },
  resolve: {
    alias: {
      // تعيين المسار المستعار '@' ليشير إلى مجلد 'src'
      '@': path.resolve(__dirname, './src'),
      // Fix for uuid issue during dependency optimization
      // Vite sometimes struggles to resolve the correct browser entry point for uuid.
      // This alias explicitly points it to the correct file.
      'uuid': path.resolve(__dirname, './node_modules/uuid/dist/esm-browser/index.js'),
    },
  },
});