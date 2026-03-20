import { createRouter, createWebHistory } from 'vue-router';
import { pageDefinitions } from '@/shared/page-config.js';

const routes = pageDefinitions.flatMap(({ paths, component, title, icon }) =>
  paths.map((path) => ({
    path,
    component,
    meta: { title, icon }
  }))
);

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
});

router.afterEach((to) => {
  document.title = to.meta.title || 'Gloduck';
});

export default router;
