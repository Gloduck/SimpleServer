import { createRouter, createWebHistory } from 'vue-router';
import IndexView from '@/views/IndexView.vue';
import JrebelView from '@/views/JrebelView.vue';
import TorrentView from '@/views/TorrentView.vue';
import GithubView from '@/views/GithubView.vue';
import ImageEditorView from '@/views/ImageEditorView.vue';
import ForwardView from '@/views/ForwardView.vue';
import ClipboardView from '@/views/ClipboardView.vue';
import MdEditorView from '@/views/MdEditorView.vue';

const routes = [
  { path: '/', component: IndexView },
  { path: '/jrebel', component: JrebelView },
  { path: '/torrent', component: TorrentView },
  { path: '/github', component: GithubView },
  { path: '/imageEditor', component: ImageEditorView },
  { path: '/forward', component: ForwardView },
  { path: '/clipboard', component: ClipboardView },
  { path: '/clipboard/:id', component: ClipboardView },
  { path: '/mdeditor', component: MdEditorView }
];

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
});
