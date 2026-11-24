/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor chunks so app deploys do not bust the framework cache.
        manualChunks: { react: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'], supabase: ['@supabase/supabase-js'] },
      },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
