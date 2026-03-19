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
  { path: '/', component: IndexView, meta: { title: '工具导航' } },
  { path: '/jrebel', component: JrebelView, meta: { title: 'JRebel激活工具' } },
  { path: '/torrent', component: TorrentView, meta: { title: '磁力聚合搜索' } },
  { path: '/github', component: GithubView, meta: { title: 'GitHub仓库搜索' } },
  { path: '/imageEditor', component: ImageEditorView, meta: { title: '图片处理工具' } },
  { path: '/forward', component: ForwardView, meta: { title: '转发下载工具' } },
  { path: '/clipboard', component: ClipboardView, meta: { title: '网络剪贴板' } },
  { path: '/clipboard/:id', component: ClipboardView, meta: { title: '网络剪贴板' } },
  { path: '/mdeditor', component: MdEditorView, meta: { title: 'Markdown编辑器' } }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
});

router.afterEach((to) => {
  document.title = to.meta.title || 'Gloduck';
});

export default router;
