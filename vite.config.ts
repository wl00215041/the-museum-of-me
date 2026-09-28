import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    // Test artefacts and the plan workspace change during e2e runs; never let them trigger reloads.
    watch: { ignored: ['**/test-results/**', '**/playwright-report/**', '**/.superpowers/**'] },
  },
  optimizeDeps: {
    include: ['three', 'three/addons/environments/RoomEnvironment.js', 'postprocessing', 'n8ao', 'mediabunny', '@mediabunny/aac-encoder'],
  },
  build: { target: 'es2022' },
});
