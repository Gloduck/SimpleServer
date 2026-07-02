import { createApp } from 'vue';
import App from './App.vue';
import router from './router/index.js';
import './style.css';
import Cropper from 'cropperjs';
import Vditor from 'vditor';

window.__APP_ROUTER__ = router;
window.Cropper = Cropper;
window.Vditor = Vditor;

createApp(App).use(router).mount('#app');
