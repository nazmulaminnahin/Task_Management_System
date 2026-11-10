import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Dev proxy keeps the browser on one origin:
 *   /api  → Express REST API      (localhost:4000)
 *   /socket.io → Socket.io server (same process)
 * `changeOrigin` + `ws` make both HTTP and WebSocket upgrade requests pass through.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/socket.io': { target: 'http://127.0.0.1:4000', changeOrigin: true, ws: true },
    },
  },
  preview: { host: '0.0.0.0', port: 5173, allowedHosts: true },
});
