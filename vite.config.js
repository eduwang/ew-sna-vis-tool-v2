import { defineConfig } from 'vite';

export default defineConfig({
  // Netlify 배포를 위한 설정
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: './index.html',
        networkVisualizer: './network-visualizer.html',
        networkVisualizer3d: './network-visualizer-3d.html',
        snaProjectSample: './sna-project-sample.html',
        makeReport: './make-a-report.html',
        analyzeWithAI: './analyze-with-ai.html',
        admin: './admin.html'
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});

