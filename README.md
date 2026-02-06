+ 一个自用的API服务，基于JDK自带的HttpServer实现，使用CSV文件作为数据库，并且支持所使用Graalvm提供的NativeImage进行编译
+ 目前已经支持的功能：
    + 聚合磁力搜索
    + Jrebel激活服务器
    + 网络剪切板
    + 转发下载工具
    + Github项目搜索
    + Markdown编辑器
+ 由于是自用的API服务，所以功能比较少，并且尽可能少的引入了三方依赖。

# 备注

## 磁力搜索

+ 有些磁力网站开启了Cloudflare防护，所以需要使用Cloudflare绕过API才能正常访问。
    + 使用项目：https://github.com/sarperavci/CloudflareBypassForScraping
    + 使用Docker命令，启动：
      ``` shell
      docker run -p 2227:8000 ghcr.io/sarperavci/cloudflarebypassforscraping:latest
      ```
    + 如果要修改端口，需要同步修改配置文件中：bypassCfApi的端口
    + 如果要为Cloudflare绕过API单独设置代理，需要确保容器内部能访问代理，并且修改配置文件中：bypassCfApiProxy，添加代理地址。
    由于绕过Cloudflare需要需要一定的时间，所以需要将requestTimeout设置为较大的值，例如：30秒。
    
