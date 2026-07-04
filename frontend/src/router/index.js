import { createRouter, createWebHistory } from 'vue-router';
import { pageDefinitions } from '@/shared/page-config.js';

const routes = pageDefinitions.flatMap(({ paths, component, title, icon, desc }) =>
  paths.map((path) => ({
    path,
    component,
    meta: { title, icon, desc }
  }))
);

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
});

router.afterEach((to) => {
  document.title = to.meta.title || 'Gloduck';
  setMetaContent('description', to.meta.desc || '');
});

function setMetaContent(name, content) {
  let meta = document.querySelector(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

export default router;
