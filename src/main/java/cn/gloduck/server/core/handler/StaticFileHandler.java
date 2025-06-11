package cn.gloduck.server.core.handler;

import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.util.FileUtils;
import com.sun.net.httpserver.HttpExchange;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public class StaticFileHandler implements ControllerHandler {
    private final String fileBaseDir;

    private final String matchPath;

    private final String ignoreUrlPathPrefix;

    public StaticFileHandler(String fileBaseDir, String mathUrlPath) {
        this.fileBaseDir = fileBaseDir;
        this.matchPath = mathUrlPath;
        this.ignoreUrlPathPrefix = null;
    }

    public StaticFileHandler(String fileBaseDir, String mathUrlPath, String ignoreMathUrlPathPrefix) {
        if (ignoreMathUrlPathPrefix != null && !mathUrlPath.startsWith(ignoreMathUrlPathPrefix)) {
            throw new IllegalArgumentException("ignoreMathUrlPathPrefix must be start with mathUrlPath");
        }
        this.fileBaseDir = fileBaseDir;
        this.matchPath = mathUrlPath;
        this.ignoreUrlPathPrefix = ignoreMathUrlPathPrefix;
    }

    @Override
    public HttpMethod getHttpMethod() {
        return HttpMethod.GET;
    }

    @Override
    public String getRequestPath() {
        return matchPath;
    }

    @Override
    public String getContentType(HttpExchange exchange) {
        String requestPath = exchange.getRequestURI().getPath();
        String fileExt = FileUtils.getFileExtensionFromUrl(requestPath);
        return FileUtils.getContentTypeFromExtension(fileExt);
    }

    @Override
    public byte[] handleRequest(HttpExchange exchange) throws IOException {
        String requestPath = exchange.getRequestURI().getPath();
        if (ignoreUrlPathPrefix != null) {
            requestPath = requestPath.substring(ignoreUrlPathPrefix.length());
        }
        Path filePath = Paths.get(fileBaseDir, requestPath);

        if (!Files.exists(filePath)) {
            throw new FileNotFoundException("Resource not found");
        }

        return Files.readAllBytes(filePath);
    }
}
