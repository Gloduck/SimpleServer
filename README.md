# SimpleServer

一个自用的 API 服务，后端基于 Quarkus 实现，使用 CSV 文件作为轻量数据库，并支持 GraalVM Native Image 构建。

当前已包含的功能：

- JRebel激活工具
- 磁力聚合搜索
- GitHub仓库搜索
- 图片处理工具
- 转发下载工具
- 网络剪贴板
- Markdown编辑器
- 代码编辑器

## 模块说明

- `backend/`：后端服务代码
- `frontend/`：前端页面
- `include/`：当前目录下的所有文件会在build过后包含在构建输出目录
- `script/`：项目脚本，包括构建脚本和远程管理脚本
- `db/`：本地开发阶段使用的 CSV 数据目录
- `target/`：构建输出目录，生成 jar/native、配置文件、管理脚本和压缩包

## 本地启动

开发模式：

```bash
mvn -f backend/pom.xml quarkus:dev
```

Quarkus dev 默认监听调试端口 `5005`，IDE 可以通过 remote debugger attach 到 `localhost:5005`。

普通 jar：

```bash
mvn -f backend/pom.xml package -DskipTests
java -jar backend/target/SimpleServer-1.0-runner.jar
```

Native：

```bash
mvn -f backend/pom.xml package -Dquarkus.native.enabled=true -Dquarkus.native.native-image-xmx=2g -DskipTests
backend/target/SimpleServer-1.0-runner
```

## 配置说明

默认配置文件位于 `backend/src/main/resources/config.json`。

运行时配置读取顺序：

- 程序所在目录下的 `config.json`
- `resources` 中的默认配置

日志配置位于 `log` 节点，例如：

```json
{
  "log": {
    "level": "INFO",
    "file": "logs/app.log",
    "maxFileSize": "10M"
  }
}
```

- `log.level`：日志级别
- `log.file`：日志文件路径；当前由 Quarkus file logging 输出，不支持日期模板
- `log.maxFileSize`：单个日志文件最大大小，例如 `10M`、`100M`

## 构建脚本

构建脚本：`script/build.sh`

用法：

```bash
bash script/build.sh buildJar
bash script/build.sh buildNative
bash script/build.sh clean
bash script/build.sh clean buildJar
```

说明：

- `buildJar`：构建前端并打包后端 Quarkus runner jar 版本
- `buildNative`：构建前端并打包后端 native 版本，需要本机可用 `native-image`
- `clean`：清理前端构建目录、后端构建目录和根目录 `target/`

构建完成后，构建产物位于：`target/` 

## 管理脚本

脚本模板位于 `include/manage.sh`，构建时会复制到 `target/manage.sh`。

用法：

```bash
bash manage.sh start
bash manage.sh stop
bash manage.sh restart
bash manage.sh status
```

说明：

- `start`：后台启动服务
- `stop`：结束服务
- `restart`：重启服务
- `status`：查看服务状态

jar 模式支持通过 `JAVA_OPTS` 传入 JVM 参数，例如：

```bash
JAVA_OPTS="-Xms256m -Xmx512m" bash manage.sh start
```

## 远程管理脚本

远程管理脚本：`script/remote-manage.sh`

用法：

```bash
bash script/remote-manage.sh push
bash script/remote-manage.sh start
bash script/remote-manage.sh restart
bash script/remote-manage.sh stop
bash script/remote-manage.sh status
```

也支持通过参数覆盖远程配置：

```bash
bash script/remote-manage.sh push \
  --remoteAddress 127.0.0.1 \
  --remotePort 22 \
  --remoteUser root \
  --remoteDeployPath /opt/SimpleServer
```

如需同时推送配置文件：

```bash
bash script/remote-manage.sh push --includeConfig
```

默认从项目根目录 `.env` 读取以下配置：

```env
remoteAddress=127.0.0.1
remotePort=22
remoteUser=root
remotePassword=xxx
remoteDeployPath=/opt/SimpleServer
```

说明：

- 推送前建议先确认本地配置文件与远程配置文件是否一致，避免覆盖或遗漏必要配置
- `push`：将本地 `target/` 下的发布文件直接推送到远程部署目录，不上传压缩包，默认不上传 `config.json`，也不会清空远程目录中的其他文件
- `push --includeConfig`：推送时额外包含 `target/config.json`
- `start|restart|stop|status`：通过远程调用部署目录中的 `manage.sh` 执行
- 支持 SSH 密钥登录
- 如果配置了 `remotePassword`，则通过 `sshpass` 走密码登录

必要配置缺失时脚本会直接报错。

## 服务说明

### 代码编辑器

访问路径：`/codeEditor`

代码编辑器基于 Monaco Editor 和浏览器 File System Access API 实现，可以直接打开并读写本地目录，适合进行轻量级代码浏览、修改和 AI 辅助开发。文件访问能力主要面向 Chromium 系浏览器，并要求页面运行在 HTTPS 或 `localhost` 环境。

主要功能：

- 本地工作区：递归文件树、多文件标签页、新建文件或目录、保存、删除及语言切换
- 搜索与变更：跨文件文本搜索和替换、未保存变更列表、批量保存或回滚、Monaco Diff 对比
- 编辑体验：语法高亮、命令面板、代码折叠、Minimap、自动换行、主题、字号和可自定义快捷键
- 预览与格式化：支持 Markdown、MDX、HTML 侧边预览和图片查看，并为常用前端语言动态加载 Prettier 格式化能力
- AI 行内补全：通过快捷键手动触发当前代码位置的补全建议
- AI 编程助手：兼容 OpenAI Responses API，可配置模型和推理等级，支持 SSE 流式请求、多会话独立运行、停止任务、上下文压缩和 Token 用量展示
- AI 工作区工具：支持文件列举、读取、搜索、创建、修改、待删除、Diff、图片读取、图片生成或编辑、隔离 JavaScript 执行及后端 HTTP 代理
- 工作区指令：自动读取根目录 `AGENTS.md`，作为 AI 执行任务时的附加约束
- SSH 与 SFTP：通过后端连接远程主机，支持多终端标签、文件上传下载、传输进度和任务取消
- AI 远程工具：可将指定 SSH 配置暴露给 AI，并通过命令白名单、高风险确认和执行原因展示控制命令调用
- PWA：支持安装为独立应用，并缓存应用页面和已访问的同源静态资源
- 设置导入导出：可将编辑器、AI、后端和 SSH 设置压缩到 URL Hash 中，用于迁移配置

使用说明：

- AI 创建或修改的文件默认只保存在编辑器内存中，需要用户检查变更后手动保存到磁盘
- 图片生成模型可单独配置；图片工具未传输入图片时调用 OpenAI Images generations 接口，传入图片时调用 edits 接口，结果会在聊天框和编辑器中预览
- 多个 AI 会话的消息、运行状态、停止控制器和上下文用量相互隔离，但仍共享同一个工作区；同时修改同一文件时可能产生冲突
- AI 会话只保存在当前页面内存中，刷新页面后不会恢复
- AI 接口由浏览器直接请求，服务端需要允许 CORS；长任务使用 SSE 流式响应，避免无响应数据时触发网关超时
- SSH、SFTP 和 HTTP 请求代理依赖后端服务，单独运行前端时不可用
- 设置保存在浏览器 `localStorage`。导出的设置 URL 可能包含 AI API Key、SSH 密码或私钥等敏感信息，请勿公开分享
- 当前不包含完整 IDE 的 LSP、调试器、扩展系统和 Git 暂存区；“查找引用”基于工作区文本匹配

### 磁力聚合搜索

部分磁力站点启用了 Cloudflare 防护，需要额外的绕过服务才能访问。

可使用项目：`https://github.com/sarperavci/CloudflareBypassForScraping`
- 如果修改了绕过服务端口，需要同步调整配置里的 `torrent.bypassCfApi`
- 如果绕过服务需要单独代理，需要配置 `torrent.bypassCfApiProxy`
- Cloudflare 绕过通常较慢，建议适当调大对应站点的 `requestTimeout`
