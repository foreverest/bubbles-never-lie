import { devvit } from '@devvit/start/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

function manualChunks(id: string): string | undefined {
  if (id.includes('node_modules/zrender')) {
    return 'zrender';
  }

  if (id.includes('node_modules/echarts')) {
    return 'echarts';
  }

  if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
    return 'react';
  }

  if (id.includes('node_modules/@devvit')) {
    return 'devvit';
  }
}

export default defineConfig({
  plugins: [
    react(),
    devvit({
      client: {
        build: {
          rollupOptions: {
            output: {
              manualChunks,
            },
          },
        },
      },
    }),
  ],
});
