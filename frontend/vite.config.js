import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ command }) => {
  const backendProxyTarget = process.env.VITE_BACKEND_PROXY_TARGET;

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        vue: 'vue/dist/vue.esm-bundler.js'
      }
    },
    server: backendProxyTarget ? {
      proxy: {
        '/api': {
          target: backendProxyTarget,
          changeOrigin: true,
          ws: true,
          secure: false
        }
      }
    } : undefined
  };
});
