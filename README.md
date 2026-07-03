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
    "file": "logs/app.log"
  }
}
```

- `log.level`：日志级别
- `log.file`：日志文件路径；当前由 Quarkus file logging 输出，不支持日期模板

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

默认从项目根目录 `.env` 读取以下配置：

```env
remoteAddress=127.0.0.1
remotePort=22
remoteUser=root
remotePassword=xxx
remoteDeployPath=/opt/SimpleServer
```

说明：

- `push`：将本地 `target/` 下的发布文件直接推送到远程部署目录，不上传压缩包，也不会清空远程目录中的其他文件
- `start|restart|stop|status`：通过远程调用部署目录中的 `manage.sh` 执行
- 支持 SSH 密钥登录
- 如果配置了 `remotePassword`，则通过 `sshpass` 走密码登录

必要配置缺失时脚本会直接报错。

## 服务说明

### 磁力聚合搜索

部分磁力站点启用了 Cloudflare 防护，需要额外的绕过服务才能访问。

可使用项目：`https://github.com/sarperavci/CloudflareBypassForScraping`
- 如果修改了绕过服务端口，需要同步调整配置里的 `torrent.bypassCfApi`
- 如果绕过服务需要单独代理，需要配置 `torrent.bypassCfApiProxy`
- Cloudflare 绕过通常较慢，建议适当调大对应站点的 `requestTimeout`
