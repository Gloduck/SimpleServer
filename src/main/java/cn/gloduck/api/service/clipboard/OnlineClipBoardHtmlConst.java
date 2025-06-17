package cn.gloduck.api.service.clipboard;

public class OnlineClipBoardHtmlConst {
    public static final String CLIPBOARD_PAGE = """
            <!DOCTYPE html>
            <html lang="zh-CN">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>网络剪贴板</title>
                <!-- 引入CodeMirror代码编辑器 -->
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/codemirror.min.css">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/theme/eclipse.min.css">
                <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/codemirror.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/mode/javascript/javascript.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/mode/xml/xml.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/mode/css/css.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/mode/htmlmixed/htmlmixed.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/mode/python/python.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/mode/clike/clike.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/mode/php/php.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/mode/sql/sql.min.js"></script>
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    }
                        
                    body {
                        background-color: #f5f7fa;
                        min-height: 100vh;
                        padding: 20px;
                        color: #333;
                    }
                        
                    .container {
                        max-width: 1200px;
                        margin: 0 auto;
                        background: white;
                        border-radius: 12px;
                        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
                        overflow: hidden;
                        transition: all 0.3s ease;
                    }
                        
                    .container:hover {
                        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
                    }
                        
                    header {
                        background: #249ffd;
                        color: white;
                        padding: 25px;
                        text-align: center;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                    }
                        
                    .clipboard-name {
                        font-size: 2.2rem;
                        margin: 10px 0;
                        letter-spacing: 0.5px;
                        font-weight: 600;
                        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                    }
                        
                    .clipboard-id {
                        background: #7da5d8;
                        padding: 6px 18px;
                        border-radius: 20px;
                        font-size: 0.95rem;
                        display: inline-block;
                        margin-top: 10px;
                        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
                    }
                        
                    .controls {
                        display: flex;
                        flex-wrap: wrap;
                        justify-content: space-between;
                        padding: 18px;
                        background: #f8fafc;
                        border-bottom: 1px solid #e2e8f0;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
                    }
                        
                    .left-controls, .right-controls {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 15px;
                        align-items: center;
                    }
                        
                    .control-group {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 6px 12px;
                        background: white;
                        border-radius: 8px;
                        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
                        transition: all 0.2s ease;
                    }
                        
                    .control-group:hover {
                        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.08);
                    }
                        
                    label {
                        font-weight: 500;
                        cursor: pointer;
                        user-select: none;
                        color: #4a5568;
                    }
                        
                    input[type="checkbox"] {
                        width: 18px;
                        height: 18px;
                        cursor: pointer;
                        accent-color: #5a8dcc;
                    }
                        
                    select {
                        padding: 8px 16px;
                        border-radius: 8px;
                        border: 1px solid #e2e8f0;
                        background: white;
                        font-size: 0.9rem;
                        cursor: pointer;
                        min-width: 140px;
                        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
                        transition: all 0.2s ease;
                    }
                        
                    select:hover {
                        border-color: #cbd5e0;
                        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.08);
                    }
                        
                    button {
                        padding: 9px 18px;
                        border: none;
                        border-radius: 8px;
                        background: #5a8dcc;
                        color: white;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
                    }
                        
                    button:hover:not(:disabled) {
                        transform: translateY(-2px);
                        box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
                    }
                        
                    button:active:not(:disabled) {
                        transform: translateY(0);
                    }
                        
                    button:disabled {
                        background: #cbd5e0;
                        cursor: not-allowed;
                        opacity: 0.7;
                    }
                        
                    button.delete {
                        background: #e53e3e;
                    }
                        
                    button.delete:disabled {
                        background: #e2b4b4;
                    }
                        
                    button.save {
                        background: #48bb78;
                    }
                        
                    button.save:disabled {
                        background: #b8e0c8;
                    }
                        
                    button.copy {
                        background: #9f7aea;
                    }
                        
                    button.copy:disabled {
                        background: #d4c4f0;
                    }
                        
                    .editor-container {
                        padding: 0 18px 18px;
                    }
                        
                    .CodeMirror {
                        border-radius: 8px;
                        border: 1px solid #e2e8f0;
                        height: 450px;
                        font-size: 15px;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
                    }
                        
                    .CodeMirror-disabled {
                        background: #f8fafc;
                        opacity: 0.8;
                    }
                        
                    .status-bar {
                        display: flex;
                        justify-content: space-between;
                        padding: 12px 18px;
                        background: #f8fafc;
                        color: #718096;
                        font-size: 0.9rem;
                        border-top: 1px solid #e2e8f0;
                        box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.03);
                    }
                        
                    .message {
                        background: #48bb78;
                        color: white;
                        padding: 14px;
                        margin: 18px;
                        border-radius: 8px;
                        text-align: center;
                        display: none;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                    }
                        
                    .message.show {
                        display: block;
                        animation: fadeInOut 3s forwards;
                    }
                        
                    .message.error {
                        background: #e53e3e;
                    }
                        
                    @keyframes fadeInOut {
                        0% {
                            opacity: 0;
                            transform: translateY(-20px);
                        }
                        10% {
                            opacity: 1;
                            transform: translateY(0);
                        }
                        90% {
                            opacity: 1;
                            transform: translateY(0);
                        }
                        100% {
                            opacity: 0;
                            transform: translateY(-20px);
                        }
                    }
                        
                    .info-text {
                        text-align: center;
                        padding: 15px;
                        color: #718096;
                        font-size: 0.9rem;
                        border-top: 1px solid #e2e8f0;
                    }
                        
                    @media (max-width: 768px) {
                        .controls {
                            flex-direction: column;
                            gap: 12px;
                        }
                        
                        .left-controls, .right-controls {
                            width: 100%;
                            justify-content: center;
                        }
                        
                        .clipboard-name {
                            font-size: 1.8rem;
                        }
                    }
                        
                    @media (max-width: 480px) {
                        .left-controls, .right-controls {
                            flex-direction: column;
                        }
                        
                        button, select {
                            width: 100%;
                            justify-content: center;
                        }
                        
                        .control-group {
                            width: 100%;
                            justify-content: center;
                        }
                    }
                </style>
            </head>
            <body>
            <div class="container">
                <header>
                    <div class="clipboard-name">剪贴板: <span id="clipboard-id" class="clipboard-id">loading...</span></div>
                </header>
                        
                <div class="controls">
                    <div class="left-controls">
                        <div class="control-group">
                            <input type="checkbox" id="auto-copy">
                            <label for="auto-copy">服务器更新时自动复制到剪贴板</label>
                        </div>
                        
                        <div class="control-group">
                            <input type="checkbox" id="auto-refresh">
                            <label for="auto-refresh">自动刷新</label>
                        </div>
                        
                        <div class="control-group">
                            <input type="checkbox" id="auto-save">
                            <label for="auto-save">自动保存</label>
                        </div>
                        
                        <button id="delete-btn" class="delete">删除剪贴板</button>
                        <button id="save-btn" class="save">保存内容</button>
                        <button id="copy-btn" class="copy">复制内容</button>
                    </div>
                        
                    <div class="right-controls">
                        <select id="format-select">
                            <option value="text">纯文本</option>
                            <option value="javascript">JavaScript</option>
                            <option value="htmlmixed">HTML</option>
                            <option value="css">CSS</option>
                            <option value="python">Python</option>
                            <option value="text/x-java">Java</option>
                            <option value="php">PHP</option>
                            <option value="sql">SQL</option>
                        </select>
                    </div>
                </div>
                        
                <div class="editor-container">
                    <textarea id="code-editor"></textarea>
                </div>
                        
                <div class="status-bar">
                    <div>最后更新: <span id="last-updated">从未更新</span></div>
                    <div>状态: <span id="editor-status">就绪</span></div>
                </div>
                        
                <div class="message" id="message"></div>
                        
                <div class="info-text">
                    <p>提示: 使用 Ctrl+S 保存内容 | 内容会被明文保存到服务器，请不要保存敏感信息</p>
                </div>
            </div>
                        
            <script>
                // 获取剪贴板ID
                const pathSegments = window.location.pathname.split('/');
                const clipboardId = pathSegments[pathSegments.length - 1];
                        
                // 初始化UI元素
                const clipboardIdElement = document.getElementById('clipboard-id');
                const autoCopyCheckbox = document.getElementById('auto-copy');
                const autoRefreshCheckbox = document.getElementById('auto-refresh');
                const autoSaveCheckbox = document.getElementById('auto-save');
                const deleteButton = document.getElementById('delete-btn');
                const saveButton = document.getElementById('save-btn');
                const copyButton = document.getElementById('copy-btn');
                const formatSelect = document.getElementById('format-select');
                const lastUpdatedElement = document.getElementById('last-updated');
                const editorStatusElement = document.getElementById('editor-status');
                const messageElement = document.getElementById('message');
                const editorElement = document.getElementById('code-editor');
                        
                // 初始化编辑器
                const editor = CodeMirror.fromTextArea(editorElement, {
                    lineNumbers: true,
                    mode: "text",
                    theme: "eclipse",
                    lineWrapping: true,
                    indentUnit: 4,
                    autofocus: true,
                    readOnly: false
                });
                        
                // 状态变量
                let lastUserEditTime = 0;
                let isUpdatingFromServer = false;
                let isFirstUpdate = true;
                        
                // 禁用编辑器
                function disableEditor() {
                    editor.setOption('readOnly', true);
                    editor.getWrapperElement().classList.add('CodeMirror-disabled');
                }
                        
                // 从localStorage加载设置
                function loadSettings() {
                    const settings = JSON.parse(localStorage.getItem('clipboardSettings')) || {};
                    autoCopyCheckbox.checked = settings.autoCopy || false;
                    autoRefreshCheckbox.checked = settings.autoRefresh || false;
                    autoSaveCheckbox.checked = settings.autoSave || false;
                    formatSelect.value = settings.format || 'text';
                        
                    // 设置编辑器模式
                    editor.setOption("mode", settings.format || "text");
                }
                        
                // 保存设置到localStorage
                function saveSettings() {
                    const settings = {
                        autoCopy: autoCopyCheckbox.checked,
                        autoRefresh: autoRefreshCheckbox.checked,
                        autoSave: autoSaveCheckbox.checked,
                        format: formatSelect.value
                    };
                    localStorage.setItem('clipboardSettings', JSON.stringify(settings));
                }
                        
                // 显示消息
                function showMessage(text, isError = false) {
                    messageElement.textContent = text;
                    messageElement.className = isError ? 'message error show' : 'message show';
                        
                    // 3秒后隐藏消息
                    setTimeout(() => {
                        messageElement.className = 'message';
                    }, 3000);
                }
                        
                // 格式化时间
                function formatTime(timestamp) {
                    if (!timestamp) return "从未更新";
                        
                    const date = new Date(timestamp);
                    return date.toLocaleString();
                }
                        
                // 获取剪贴板内容
                async function fetchClipboardContent() {
                    // 如果最近2秒内有用户编辑，跳过此次更新
                    const now = Date.now();
                    if (now - lastUserEditTime < 2000) {
                        editorStatusElement.textContent = "跳过自动更新（编辑中）";
                        return;
                    }
                        
                    try {
                        isUpdatingFromServer = true;
                        editorStatusElement.textContent = "正在获取内容...";
                        const beforeValue = editor.getValue();
                        const response = await fetch(`/clipboard/v1/query?id=${clipboardId}`);
                        const data = await response.json();
                        
                        if (data.code === 200) {
                            if (data.data === null) {
                                editorStatusElement.textContent = "新建";
                                lastUpdatedElement.textContent = "从未更新";
                                clipboardIdElement.textContent = clipboardId;
                                return;
                            }
                        
                            // 只有在内容不同时才更新编辑器
                            const newValue = data.data.content;
                            if (beforeValue !== newValue) {
                                editor.setValue(newValue);
                                editorStatusElement.textContent = "内容已更新";
                            } else {
                                editorStatusElement.textContent = "内容已是最新";
                            }
                        
                            lastUpdatedElement.textContent = formatTime(data.data.updateDate);
                            clipboardIdElement.textContent = data.data.id;
                        
                            // 如果自动复制开启且内容有变化
                            if (autoCopyCheckbox.checked && beforeValue !== newValue) {
                                copyToClipboard(newValue);
                            }
                        } else {
                            showMessage(`错误: ${data.msg}`, true);
                            editorStatusElement.textContent = "获取失败";
                        }
                    } catch (error) {
                        showMessage(`网络错误: ${error.message}`, true);
                        editorStatusElement.textContent = "网络错误";
                    } finally {
                        isUpdatingFromServer = false;
                    }
                }
                        
                // 保存剪贴板内容
                async function saveClipboardContent() {
                    const content = editor.getValue();
                    const contentType = formatSelect.value;
                        
                    try {
                        editorStatusElement.textContent = "正在保存...";
                        const response = await fetch('/clipboard/v1/save', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                id: clipboardId,
                                content: content,
                                contentType: contentType
                            })
                        });
                        
                        const data = await response.json();
                        if (data.code === 200) {
                            showMessage("内容保存成功!");
                            lastUpdatedElement.textContent = formatTime(Date.now());
                            editorStatusElement.textContent = "保存成功";
                            return true;
                        } else {
                            showMessage(`保存失败: ${data.msg}`, true);
                            editorStatusElement.textContent = "保存失败";
                            return false;
                        }
                    } catch (error) {
                        showMessage(`网络错误: ${error.message}`, true);
                        editorStatusElement.textContent = "网络错误";
                        return false;
                    }
                }
                        
                // 删除剪贴板
                async function deleteClipboard() {
                    if (!confirm("确定要删除这个剪贴板吗？此操作不可撤销！")) return;
                        
                    try {
                        editorStatusElement.textContent = "正在删除...";
                        const response = await fetch(`/clipboard/v1/delete?id=${clipboardId}`, {
                            method: 'DELETE'
                        });
                        
                        const data = await response.json();
                        if (data.code === 200) {
                            showMessage("剪贴板已成功删除");
                            editor.setValue("");
                            editorStatusElement.textContent = "已删除";
                        
                            // 禁用所有操作
                            saveButton.disabled = true;
                            copyButton.disabled = true;
                            deleteButton.disabled = true;
                            autoRefreshCheckbox.disabled = true;
                            autoSaveCheckbox.disabled = true;
                            autoCopyCheckbox.disabled = true;
                            formatSelect.disabled = true;
                        
                            // 禁用编辑器
                            disableEditor();
                        } else {
                            showMessage(`删除失败: ${data.msg}`, true);
                            editorStatusElement.textContent = "删除失败";
                        }
                    } catch (error) {
                        showMessage(`网络错误: ${error.message}`, true);
                        editorStatusElement.textContent = "网络错误";
                    }
                }
                        
                // 复制到剪贴板
                function copyToClipboard(text) {
                    navigator.clipboard.writeText(text).then(() => {
                        showMessage("内容已复制到剪贴板");
                    }).catch(err => {
                        showMessage("复制失败: " + err, true);
                    });
                }
                        
                // 防抖函数，避免频繁保存
                function debounce(func, wait) {
                    let timeout;
                    return function () {
                        const context = this;
                        const args = arguments;
                        clearTimeout(timeout);
                        timeout = setTimeout(() => {
                            func.apply(context, args);
                        }, wait);
                    };
                }
                        
                // 初始化应用
                function initApp() {
                    clipboardIdElement.textContent = clipboardId;
                    loadSettings();
                    fetchClipboardContent();
                        
                    // 设置自动刷新
                    let refreshInterval;
                        
                    function setupRefresh() {
                        if (refreshInterval) clearInterval(refreshInterval);
                        if (autoRefreshCheckbox.checked) {
                            refreshInterval = setInterval(fetchClipboardContent, 3000);
                        }
                    }
                        
                    // 防抖的自动保存函数
                    const debouncedAutoSave = debounce(async () => {
                        if (autoSaveCheckbox.checked) {
                            const success = await saveClipboardContent();
                            if (success) {
                                showMessage("内容已自动保存");
                            }
                        }
                    }, 1000);
                        
                    // 事件监听器
                    autoCopyCheckbox.addEventListener('change', saveSettings);
                    autoRefreshCheckbox.addEventListener('change', () => {
                        saveSettings();
                        setupRefresh();
                    });
                    autoSaveCheckbox.addEventListener('change', saveSettings);
                        
                    formatSelect.addEventListener('change', () => {
                        editor.setOption("mode", formatSelect.value);
                        saveSettings();
                    });
                        
                    editor.on("change", () => {
                        // 记录用户编辑时间
                        if (!isUpdatingFromServer) {
                            lastUserEditTime = Date.now();
                        }
                        
                        if(isFirstUpdate){
                            isFirstUpdate = false;
                            return;
                        }
            /*            if (autoCopyCheckbox.checked) {
                            copyToClipboard(editor.getValue());
                        }*/
                        
                        // 如果启用了自动保存，则调用防抖保存函数
                        if (autoSaveCheckbox.checked) {
                            debouncedAutoSave();
                        }
                    });
                        
                    deleteButton.addEventListener('click', deleteClipboard);
                    saveButton.addEventListener('click', saveClipboardContent);
                    copyButton.addEventListener('click', () => {
                        copyToClipboard(editor.getValue());
                    });
                        
                    // Ctrl+S 保存
                    document.addEventListener('keydown', (e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                            e.preventDefault();
                            saveClipboardContent();
                        }
                    });
                        
                    // 初始设置自动刷新
                    setupRefresh();
                }
                        
                // 启动应用
                initApp();
            </script>
            </body>
            </html>
            """;


    public static final String INDEX_PAGE = """
            <!DOCTYPE html>
            <html lang="zh-CN">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>网络剪贴板 - 首页</title>
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    }
                        
                    body {
                        background-color: #f5f7fa;
                        min-height: 100vh;
                        color: #333;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                    }
                        
                    .container {
                        width: 100%;
                        max-width: 800px;
                        padding: 40px;
                        text-align: center;
                    }
                        
                    .logo {
                        margin-bottom: 30px;
                    }
                        
                    .logo h1 {
                        font-size: 2.5rem;
                        color: #249ffd;
                        margin-bottom: 10px;
                        font-weight: 600;
                    }
                        
                    .logo p {
                        font-size: 1.1rem;
                        color: #718096;
                    }
                        
                    .search-box {
                        width: 100%;
                        max-width: 600px;
                        margin: 0 auto;
                        position: relative;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                        border-radius: 8px;
                        overflow: hidden;
                    }
                        
                    .search-input {
                        width: 100%;
                        padding: 16px 24px;
                        border: none;
                        font-size: 1.1rem;
                        outline: none;
                        border-radius: 8px;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                        transition: all 0.3s ease;
                    }
                        
                    .search-input:focus {
                        box-shadow: 0 4px 16px rgba(90, 141, 204, 0.2);
                    }
                        
                    .search-button {
                        position: absolute;
                        right: 8px;
                        top: 8px;
                        padding: 8px 16px;
                        background: #249ffd;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
                    }
                        
                    .search-button:hover {
                        background: #4a7cbb;
                        transform: translateY(-2px);
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    }
                        
                    .search-button:active {
                        transform: translateY(0);
                    }
                        
                    .instructions {
                        margin-top: 40px;
                        padding: 20px;
                        background: white;
                        border-radius: 8px;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
                    }
                        
                    .instructions h2 {
                        color: #249ffd;
                        margin-bottom: 15px;
                    }
                        
                    .instructions p {
                        color: #718096;
                        margin-bottom: 10px;
                        line-height: 1.6;
                    }
                        
                    .message {
                        margin-top: 20px;
                        padding: 12px;
                        border-radius: 6px;
                        background: #e53e3e;
                        color: white;
                        display: none;
                    }
                        
                    .message.show {
                        display: block;
                        animation: fadeInOut 3s forwards;
                    }
                        
                    @keyframes fadeInOut {
                        0% { opacity: 0; transform: translateY(-10px); }
                        10% { opacity: 1; transform: translateY(0); }
                        90% { opacity: 1; transform: translateY(0); }
                        100% { opacity: 0; transform: translateY(-10px); }
                    }
                        
                    @media (max-width: 768px) {
                        .container {
                            padding: 20px;
                        }
                        
                        .logo h1 {
                            font-size: 2rem;
                        }
                        
                        .search-input {
                            padding: 14px 20px;
                        }
                    }
                </style>
            </head>
            <body>
            <div class="container">
                <div class="logo">
                    <h1>网络剪贴板</h1>
                    <p>快速创建或访问共享的文本内容</p>
                </div>
                        
                <div class="search-box">
                    <input type="text" class="search-input" id="clipboard-id" placeholder="输入剪贴板ID，例如: my-clipboard">
                    <button class="search-button" id="go-button">前往</button>
                </div>
                        
                <div class="message" id="message"></div>
                        
                <div class="instructions">
                    <h2>使用说明</h2>
                    <p>1. 输入一个唯一的剪贴板ID（只能包含字母、数字和连字符）</p>
                    <p>2. 如果剪贴板不存在，将会在第一次输入内容过后自动创建一个新的</p>
                    <p>3. 剪贴板内容会被明文存储在服务器上，请勿输入敏感信息</p>
                </div>
            </div>
                        
            <script>
                const clipboardIdInput = document.getElementById('clipboard-id');
                const goButton = document.getElementById('go-button');
                const messageElement = document.getElementById('message');
                        
                // 显示错误消息
                function showMessage(text) {
                    messageElement.textContent = text;
                    messageElement.className = 'message show';
                        
                    setTimeout(() => {
                        messageElement.className = 'message';
                    }, 3000);
                }
                        
                // 验证剪贴板ID
                function validateClipboardId(id) {
                    return /^[a-zA-Z0-9\\-]+$/.test(id);
                }
                        
                // 跳转到剪贴板页面
                function goToClipboard() {
                    const clipboardId = clipboardIdInput.value.trim();
                        
                    if (!clipboardId) {
                        showMessage('请输入剪贴板ID');
                        return;
                    }
                        
                    if (!validateClipboardId(clipboardId)) {
                        showMessage('ID只能包含字母、数字和连字符');
                        return;
                    }
                        
                    // 跳转到剪贴板页面
                    window.location.href = `/clipboard/${clipboardId}`;
                }
                        
                // 事件监听
                goButton.addEventListener('click', goToClipboard);
                clipboardIdInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        goToClipboard();
                    }
                });
                        
                // 自动聚焦输入框
                clipboardIdInput.focus();
            </script>
            </body>
            </html>
            """;
    ;
}
