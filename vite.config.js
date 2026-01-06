import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    CLIENT_ID: JSON.stringify(process.env.CLIENT_ID || 'b644f355f49f4878bcdc373475838796'),
  },
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
  },
});
