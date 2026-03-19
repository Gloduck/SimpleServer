const CommonComponents = {
    Header: {
        props: {
            title: {
                type: String,
                required: true
            },
            icon: {
                type: String,
                default: ''
            },
            link: {
                type: String,
                default: ''
            }
        },
        template: `
            <header class="bg-white shadow-md py-3">
                <div class="container mx-auto px-4">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center cursor-pointer" 
                             :class="{ 'hover:text-primary transition-colors': link }"
                             @click="handleHeaderClick">
                            <i v-if="icon" :class="[icon, 'text-2xl mr-2 text-primary']"></i>
                            <h1 class="text-[clamp(1.2rem,2vw,1.8rem)] font-bold text-dark">
                                <span class="text-primary">{{ title }}</span>
                            </h1>
                        </div>
                        <p v-if="$slots.right" class="text-gray-600 text-sm">
                            <slot name="right"></slot>
                        </p>
                    </div>
                </div>
            </header>
        `,
        methods: {
            handleHeaderClick() {
                if (!this.link) {
                    return;
                }
                if (!this.link.startsWith('http') && window.__APP_ROUTER__) {
                    window.__APP_ROUTER__.push(this.link);
                    return;
                }
                window.open(this.link, this.link.startsWith('http') ? '_blank' : '_self');
            }
        }
    },
    Footer: {
        props: {
            description: {
                type: String,
                default: ''
            },
            copyright: {
                type: String,
                default: ''
            },
            links: {
                type: Array,
                default: () => []
            }
        },
        template: `
            <footer class="bg-dark text-white py-6">
                <div class="container mx-auto px-4">
                    <p v-if="description" class="text-gray-400 text-sm text-center mb-4">{{ description }}</p>
                    
                    <div v-if="links && links.length > 0" class="flex justify-center items-center gap-6 mb-4">
                        <a v-for="(link, index) in links" 
                           :key="index"
                           :href="link.url" 
                           :title="link.name || link.icon"
                           target="_blank"
                           class="text-gray-300 hover:text-white transition-colors duration-300 transform hover:scale-110">
                            <i v-if="link.icon" :class="[link.icon, 'text-2xl']"></i>
                            <span v-else-if="link.name" class="text-sm">{{ link.name }}</span>
                        </a>
                    </div>
                    
                    <p v-if="copyright" class="text-gray-500 text-xs text-center">{{ copyright }}</p>
                </div>
            </footer>
        `
    },

    Toast: {
        template: `
        <div v-if="visible" 
             :class="[
                 'fixed top-4 left-1/2 transform -translate-x-1/2',
                 'px-6 py-4 rounded-lg shadow-xl flex items-center gap-3',
                 'transition-all duration-300',
                 'z-[9999]',
                 typeConfig.bgClass,
                 typeConfig.textClass
             ]"
             :style="{ transform: toastTransform }">
            <i :class="[typeConfig.iconClass, 'mr-2']"></i>
            <span>{{ message }}</span>
        </div>
    `,
        data() {
            return {
                visible: false,
                message: '',
                toastTransform: 'translate(-50%, -100%)',
                currentType: 'success'
            };
        },
        computed: {
            typeConfig() {
                const configMap = {
                    success: {
                        bgClass: 'bg-green-500',
                        textClass: 'text-white',
                        iconClass: 'fas fa-check-circle'
                    },
                    error: {
                        bgClass: 'bg-red-500',
                        textClass: 'text-white',
                        iconClass: 'fas fa-exclamation-circle'
                    },
                    warning: {
                        bgClass: 'bg-amber-500',
                        textClass: 'text-white',
                        iconClass: 'fas fa-exclamation-triangle'
                    },
                    info: {
                        bgClass: 'bg-blue-500',
                        textClass: 'text-white',
                        iconClass: 'fas fa-info-circle'
                    }
                };
                return configMap[this.currentType] || configMap.success;
            }
        },
        methods: {
            show(message, type = 'success') {
                this.message = message;
                this.currentType = type;
                this.visible = true;
                this.toastTransform = 'translate(-50%, 0)';

                setTimeout(() => {
                    this.toastTransform = 'translate(-50%, -100%)';
                    setTimeout(() => {
                        this.visible = false;
                    }, 300);
                }, 3000);
            }
        }
    },

    LoadingSpinner: {
        template: `
            <div class="flex justify-center items-center py-16">
                <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
        `
    },

    Pagination: {
        template: `
            <div class="mt-8 flex justify-center items-center gap-4">
                <button @click="$emit('prev-page')"
                        :disabled="currentPage === 1"
                        :class="['px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-all flex items-center gap-1',
                                 currentPage === 1 ? 'opacity-50 cursor-not-allowed' : '']">
                    <i class="fas fa-chevron-left"></i>
                    <span>上一页</span>
                </button>
                <span class="text-gray-600">第 {{ currentPage }} 页</span>
                <button @click="$emit('next-page')"
                        :disabled="!hasNext"
                        :class="['px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-all flex items-center gap-1',
                                 !hasNext ? 'opacity-50 cursor-not-allowed' : '']">
                    <span>下一页</span>
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        `,
        props: {
            currentPage: {
                type: Number,
                default: 1
            },
            hasNext: {
                type: Boolean,
                default: false
            }
        }
    },

    Modal: {
        template: `
        <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center">
            <div class="absolute inset-0 bg-black/50 backdrop-blur" @click="handleOverlayClick"></div>
            <div :class="['relative bg-white rounded-xl shadow-2xl transform transition-all overflow-y-auto',
                          maxWidthClass, maxHeightClass]">
                <div class="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
                    <h3 class="text-xl font-bold text-gray-800 truncate">{{ title }}</h3>
                    <button @click="handleClose" class="text-gray-500 hover:text-gray-700 transition-colors">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                <div class="p-6">
                    <slot></slot>
                </div>
            </div>
        </div>
    `,
        props: {
            visible: {
                type: Boolean,
                default: false
            },
            title: {
                type: String,
                default: ''
            },
            maxWidth: {
                type: String,
                default: 'max-w-4xl'
            },
            maxHeight: {
                type: String,
                default: 'max-h-[90vh]'
            },
            closeOnOverlayClick: {
                type: Boolean,
                default: true
            }
        },
        emits: ['update:visible', 'close'],
        computed: {
            maxWidthClass() {
                return `w-full ${this.maxWidth}`;
            },
            maxHeightClass() {
                return this.maxHeight;
            }
        },
        methods: {
            handleOverlayClick() {
                if (this.closeOnOverlayClick) {
                    this.handleClose();
                }
            },
            handleClose() {
                this.$emit('update:visible', false);
                this.$emit('close');
            },
            handleKeydown(event) {
                if (event.key === 'Escape' && this.visible) {
                    this.handleClose();
                }
            }
        },
        mounted() {
            document.addEventListener('keydown', this.handleKeydown);
        },
        beforeUnmount() {
            document.removeEventListener('keydown', this.handleKeydown);
        }
    }
};

export { CommonComponents };