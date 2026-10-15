import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// @ts-expect-error - db.js is a local Node ES module
import { handleApiRequest } from './server/db.js';

function sqliteDevPlugin(): Plugin {
  return {
    name: 'sqlite-dev-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && (req.url === '/api/calendar' || req.url.startsWith('/api/'))) {
          if (handleApiRequest(req, res)) {
            return;
          }
        }
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react(), sqliteDevPlugin()],
});
