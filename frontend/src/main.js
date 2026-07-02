import { createApp } from 'vue';
import App from './App.vue';
import router from './router/index.js';
import './style.css';
import Cropper from 'cropperjs';
import Vditor from 'vditor';
import CodeMirror from 'codemirror';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/mode/xml/xml';
import 'codemirror/mode/css/css';
import 'codemirror/mode/htmlmixed/htmlmixed';
import 'codemirror/mode/python/python';
import 'codemirror/mode/clike/clike';
import 'codemirror/mode/php/php';
import 'codemirror/mode/sql/sql';
import 'codemirror/mode/yaml/yaml';

window.__APP_ROUTER__ = router;
window.Cropper = Cropper;
window.Vditor = Vditor;
window.CodeMirror = CodeMirror;

createApp(App).use(router).mount('#app');
