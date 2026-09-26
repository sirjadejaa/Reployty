import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { apiApp } from './src/server/api/app';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'reployty-api-server',
      configureServer(server) {
        server.middlewares.use('/api', apiApp);
      },
      configurePreviewServer(server) {
        server.middlewares.use('/api', apiApp);
      },
    },
  ],
  server: {
    port: 3000,
    open: false,
  },
});
