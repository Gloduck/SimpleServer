import { createApp } from 'vue';
import App from './App.vue';
import router from './router/index.js';
import './style.css';

window.__APP_ROUTER__ = router;

createApp(App).use(router).mount('#app');
