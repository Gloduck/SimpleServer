<template>
<!-- 页面容器 -->
        <div class="min-h-screen flex flex-col">
            <!-- 头部 -->
            <common-header :title="$route.meta.title" :icon="$route.meta.icon" link="/">
                <template #right>
                    常用小工具集合
                </template>
            </common-header>

            <!-- 主内容区 -->
            <main class="flex-grow container mx-auto px-4 py-8">
                <!-- 搜索区域 -->
                <div class="max-w-3xl mx-auto mb-12">
                    <div class="relative">
                        <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
                        <input type="text" v-model="searchKeyword" placeholder="搜索工具名称、描述或分类..."
                            class="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/20 outline-none transition-all shadow-lg bg-white/80">
                        <div v-if="searchKeyword" class="absolute right-4 top-1/2 -translate-y-1/2">
                            <button @click="searchKeyword = ''"
                                class="text-gray-400 hover:text-gray-600 transition-colors">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                    <p class="text-gray-500 text-sm mt-2 ml-1">
                        共 {{ filteredTools.length }} 个工具 {{ searchKeyword ? `(搜索到 ${filteredTools.length} 个结果)` : '' }}
                    </p>
                </div>

                <!-- 工具分类筛选 -->
                <div class="max-w-6xl mx-auto mb-8">
                    <div class="flex flex-wrap gap-2">
                        <button v-for="category in categories" :key="category" @click="toggleCategory(category)" :class="[
                                'px-4 py-2 rounded-full transition-all duration-300 flex items-center gap-2',
                                selectedCategories.includes(category) 
                                    ? 'bg-primary text-white shadow-md' 
                                    : 'bg-white text-gray-700 hover:bg-gray-100 shadow'
                            ]">
                            <span>{{ category }}</span>
                            <span v-if="selectedCategories.includes(category)" class="text-xs opacity-90">
                                <i class="fas fa-check"></i>
                            </span>
                        </button>
                    </div>
                </div>

                <!-- 工具卡片区域 -->
                <div class="max-w-7xl mx-auto">
                    <!-- 工具卡片网格 -->
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        <!-- 工具卡片 -->
                        <div v-for="tool in filteredTools" :key="tool.id"
                            class="bg-white rounded-2xl overflow-hidden shadow-lg transition-all duration-300 hover:-translate-y-2 hover:shadow-xl animate-fadeIn">
                            <!-- 卡片头部（颜色条） -->
                            <div class="h-2" :style="{ backgroundColor: getCategoryColor(tool.category) }"></div>

                            <!-- 卡片内容 -->
                            <div class="p-6 flex flex-col h-full">
                                <!-- 工具图标和名称 -->
                                <div class="flex items-start gap-4 mb-4">
                                    <div class="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl"
                                        :style="{ backgroundColor: getCategoryColor(tool.category) }">
                                        <i :class="tool.icon"></i>
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <h3 class="font-bold text-gray-800 text-lg truncate">{{ tool.name }}</h3>
                                        <div class="flex items-center gap-2 mt-1">
                                            <span class="px-3 py-1 rounded-full text-xs font-medium" :style="{ 
                                                    backgroundColor: getCategoryColor(tool.category) + '20',
                                                    color: getCategoryColor(tool.category) 
                                                }">
                                                {{ tool.category }}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <!-- 工具描述 -->
                                <p class="text-gray-600 mb-6 flex-grow">{{ tool.desc }}</p>

                                <!-- 卡片底部 -->
                                <div class="flex justify-between items-center pt-4 border-t border-gray-100">
                                    <a :href="tool.href" @click.prevent="goToTool(tool.href)"
                                        class="text-primary hover:text-secondary font-medium flex items-center gap-2 transition-colors">
                                        <span>立即使用</span>
                                        <i class="fas fa-arrow-right text-sm"></i>
                                    </a>
                                    <a :href="tool.href" target="_blank"
                                        class="text-primary hover:text-secondary font-medium flex items-center gap-2 transition-colors">
                                        <div class="text-gray-400 text-sm">
                                            <i class="fas fa-external-link-alt"></i>
                                        </div>
                                    </a>

                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </main>

            <!-- 页脚 -->
            <common-footer description="常用小工具集合，请勿用于非法用途" copyright="© 2025 Gloduck"
                :links="[{ icon: 'fab fa-github', url: 'https://github.com/Gloduck', name: 'Github' },{ icon: 'fas fa-blog', url: 'https://mxecy.cn', name: 'Blog' }]"></common-footer>
        </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { CommonComponents } from '@/shared/common-components.js';
import { toolCards } from '@/shared/page-config.js';

export default {
    name: 'IndexView',
            components: {
                'common-header': CommonComponents.Header,
                'common-footer': CommonComponents.Footer
            },

            setup() {
                const router = useRouter();
                // 工具数据
                const tools = ref([]);

                // 搜索和筛选
                const searchKeyword = ref('');
                const selectedCategories = ref([]);

                // 分类颜色映射
                const categoryColors = {
                    '开发': '#249ffd',
                    '工具': '#10b981',
                    '设计': '#8b5cf6',
                    '搜索': '#f59e0b',
                    '网络': '#ef4444',
                    '其他': '#6b7280'
                };

                // 获取所有分类
                const categories = computed(() => {
                    const cats = new Set();
                    tools.value.forEach(tool => {
                        if (tool.category) cats.add(tool.category);
                    });
                    return Array.from(cats).sort();
                });

                // 过滤工具
                const filteredTools = computed(() => {
                    return tools.value.filter(tool => {
                        // 搜索关键词过滤
                        const keywordMatch = !searchKeyword.value ||
                            tool.name.toLowerCase().includes(searchKeyword.value.toLowerCase()) ||
                            tool.desc.toLowerCase().includes(searchKeyword.value.toLowerCase()) ||
                            tool.category.toLowerCase().includes(searchKeyword.value.toLowerCase());

                        // 分类过滤
                        const categoryMatch = selectedCategories.value.length === 0 ||
                            selectedCategories.value.includes(tool.category);

                        return keywordMatch && categoryMatch;
                    });
                });

                // 获取分类颜色
                const getCategoryColor = (category) => {
                    return categoryColors[category] || '#6b7280';
                };

                // 切换分类选择
                const toggleCategory = (category) => {
                    const index = selectedCategories.value.indexOf(category);
                    if (index === -1) {
                        selectedCategories.value.push(category);
                    } else {
                        selectedCategories.value.splice(index, 1);
                    }
                };


                // 加载工具数据
                const loadTools = () => {
                    tools.value = toolCards;
                };


                // 页面加载时初始化
                onMounted(() => {
                    loadTools();
                });

                const goToTool = (href) => {
                    router.push(href);
                };

                return {
                    // 数据
                    tools,
                    searchKeyword,
                    selectedCategories,

                    // 计算属性
                    categories,
                    filteredTools,

                    // 方法
                    getCategoryColor,
                    toggleCategory,
                    goToTool
                };
            }
};
</script>

<style>
@keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.5s ease-in-out; }
</style>
