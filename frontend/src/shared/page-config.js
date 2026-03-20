import IndexView from '@/views/IndexView.vue';
import JrebelView from '@/views/JrebelView.vue';
import TorrentView from '@/views/TorrentView.vue';
import GithubView from '@/views/GithubView.vue';
import ImageEditorView from '@/views/ImageEditorView.vue';
import ForwardView from '@/views/ForwardView.vue';
import ClipboardView from '@/views/ClipboardView.vue';
import MdEditorView from '@/views/MdEditorView.vue';

export const pageDefinitions = [
  {
    paths: ['/'],
    component: IndexView,
    title: '工具导航',
    icon: 'fas fa-tools'
  },
  {
    paths: ['/jrebel'],
    component: JrebelView,
    title: 'JRebel激活工具',
    icon: 'fas fa-bolt',
    desc: '一键激活Jrebel开发工具',
    category: '开发'
  },
  {
    paths: ['/torrent'],
    component: TorrentView,
    title: '磁力聚合搜索',
    icon: 'fas fa-magnet',
    desc: '支持多个磁力网站的磁力搜索',
    category: '搜索'
  },
  {
    paths: ['/github'],
    component: GithubView,
    title: 'GitHub仓库搜索',
    icon: 'fab fa-github',
    desc: '搜索Github上的项目',
    category: '开发'
  },
  {
    paths: ['/imageEditor'],
    component: ImageEditorView,
    title: '图片处理工具',
    icon: 'fas fa-image',
    desc: '在线图片缩放、压缩、裁剪工具',
    category: '工具'
  },
  {
    paths: ['/forward'],
    component: ForwardView,
    title: '转发下载工具',
    icon: 'fas fa-download',
    desc: '通过转发服务器下载文件',
    category: '工具'
  },
  {
    paths: ['/clipboard', '/clipboard/:id'],
    component: ClipboardView,
    title: '网络剪贴板',
    icon: 'fas fa-clipboard',
    desc: '多设备之间同步文本的网络剪贴板',
    category: '工具'
  },
  {
    paths: ['/mdeditor'],
    component: MdEditorView,
    title: 'Markdown编辑器',
    icon: 'fas fa-pen-nib',
    desc: '基于Vditor的Markdown在线编辑器',
    category: '开发'
  }
];

export const toolCards = pageDefinitions
  .filter((page) => page.category)
  .map((page, index) => ({
    id: index + 1,
    name: page.title,
    href: page.paths[0],
    desc: page.desc,
    category: page.category,
    icon: page.icon
  }));
