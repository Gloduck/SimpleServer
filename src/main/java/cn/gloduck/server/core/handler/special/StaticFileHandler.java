package cn.gloduck.server.core.handler.special;

import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ApiEndpoint;
import cn.gloduck.server.core.util.FileUtils;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

public class StaticFileHandler extends FileHandler {
    private final List<ApiEndpoint> apiEndpoints;

    private final String fileBaseDir;

    private final String ignoreUrlPathPrefix;

    public StaticFileHandler(String fileBaseDir, String mathUrlPath) {
        this(fileBaseDir, Arrays.asList(mathUrlPath));
    }

    public StaticFileHandler(String fileBaseDir, List<String> mathUrlPaths) {
        this.fileBaseDir = fileBaseDir;
        this.ignoreUrlPathPrefix = null;
        this.apiEndpoints = mathUrlPaths.stream().map(path -> new ApiEndpoint(HttpMethod.GET, path)).collect(Collectors.toList());
    }

    public StaticFileHandler(String fileBaseDir, String mathUrlPath, String ignoreMathUrlPathPrefix) {
        if (ignoreMathUrlPathPrefix != null && !mathUrlPath.startsWith(ignoreMathUrlPathPrefix)) {
            throw new IllegalArgumentException("ignoreMathUrlPathPrefix must be start with mathUrlPath");
        }
        this.fileBaseDir = fileBaseDir;
        this.ignoreUrlPathPrefix = ignoreMathUrlPathPrefix;
        this.apiEndpoints = Arrays.asList(new ApiEndpoint(HttpMethod.GET, mathUrlPath));
    }

    @Override
    public List<ApiEndpoint> getApiEndpoints() {
        return apiEndpoints;
    }

    @Override
    protected InputStream getFileInputStream(HttpExchange exchange) throws IOException {
        String requestPath = exchange.getRequestURI().getPath();
        if (ignoreUrlPathPrefix != null) {
            requestPath = requestPath.substring(ignoreUrlPathPrefix.length());
        }
        Path filePath = Paths.get(fileBaseDir, requestPath);
        if (!Files.exists(filePath)) {
            return null;
        }
        return Files.newInputStream(filePath);
    }

    @Override
    public String getContentType(HttpExchange exchange) {
        String requestPath = exchange.getRequestURI().getPath();
        String fileExt = FileUtils.getFileExtensionFromUrl(requestPath);
        return FileUtils.getContentTypeFromExtension(fileExt);
    }

}
