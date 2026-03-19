const CommonUtils = {
    computePath: (basePath, basePathIsFile, expression) => {
        const normalizeSlashes = (p) => p.replace(/\\/g, '/');
        basePath = normalizeSlashes(basePath);
        expression = normalizeSlashes(expression);
        if (basePath !== '' && !basePath.endsWith("/")) {
            if (basePathIsFile) {
                basePath = basePath.slice(0, basePath.lastIndexOf("/") + 1);
            } else {
                basePath = basePath + "/";
            }
        }
        const addStack = (stack, parts) => {
            for (const expressionPart of parts) {
                if (expressionPart === "..") {
                    if (stack.length > 0) {
                        stack.pop();
                    } else {
                        throw new Error("path out of range");
                    }
                } else if (expressionPart === "." || expressionPart === "") {
                } else {
                    stack.push(expressionPart);
                }
            }
        }
        const stack = [];
        if (!expression.startsWith("/")) {
            addStack(stack, basePath.split("/"));
        }
        addStack(stack, expression.split("/"));

        const addSlash = basePath.startsWith("/") || expression.startsWith("/");
        return addSlash ? "/" + stack.join("/") : stack.join("/");
    },

    formatTime: (timeString) => {
        if (!timeString) return '未知';
        const date = new Date(timeString);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    formatRelativeTime: (timeString) => {
        if (!timeString) return '未知';
        const date = new Date(timeString);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return '今天';
        } else if (diffDays === 1) {
            return '昨天';
        } else if (diffDays < 7) {
            return `${diffDays}天前`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return `${weeks}周前`;
        } else if (diffDays < 365) {
            const months = Math.floor(diffDays / 30);
            return `${months}个月前`;
        } else {
            const years = Math.floor(diffDays / 365);
            return `${years}年前`;
        }
    },

    formatFileSize: (bytes) => {
        if (bytes === 0 || !bytes) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    truncateText: function (text, maxLength = 100) {
        if (!text) return text;
        if (text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength) + '...';
    },

    handleGithubApiError: (error, resultHandler) => {
        console.error('API请求错误:', error);
        let message = '请求失败';

        if (error.message.includes('API rate limit exceeded')) {
            message = 'API速率限制，请稍后再试';
        } else if (error.message) {
            message = error.message;
        }

        if (resultHandler) {
            resultHandler(message, 'error');
        } else {
            alert(message);
        }
    },

    handleApiError: (error, resultHandler) => {
        console.error('API请求错误:', error);
        let message = '请求失败';

        if (error.message) {
            message = error.message;
        }

        if (resultHandler) {
            resultHandler(message, 'error');
        } else {
            alert(message);
        }
    },

    checkJsonResponseStatus: async (response) => {
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `HTTP错误，状态码: ${response.status}`;

            try {
                const errorData = JSON.parse(errorText);
                if (errorData.message) {
                    errorMessage = errorData.message;
                }
            } catch (e) {
            }

            throw new Error(errorMessage);
        }
        return response.json();
    },

    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    copyToClipboard: (text, resultHandler) => {
        navigator.clipboard.writeText(text)
            .then(() => {
                if (resultHandler) {
                    resultHandler('已复制到剪贴板', 'success');
                }
            })
            .catch(err => {
                console.error('复制失败:', err);
                if (resultHandler) {
                    resultHandler('复制失败，请手动复制', 'error');
                }
            });
    }
};

export { CommonUtils };