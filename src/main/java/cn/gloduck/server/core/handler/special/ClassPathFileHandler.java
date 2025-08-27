package cn.gloduck.server.core.handler.special;

import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ApiEndpoint;
import cn.gloduck.server.core.util.FileUtils;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

public class ClassPathFileHandler extends FileHandler {
    private final List<ApiEndpoint> apiEndpoints;
    private final String filePath;

    public ClassPathFileHandler(String requestPath, String filePath) {
        this(Arrays.asList(requestPath), filePath);
    }

    public ClassPathFileHandler(List<String> requestPaths, String filePath) {
        this.apiEndpoints = requestPaths.stream().map(requestPath -> new ApiEndpoint(HttpMethod.GET, requestPath)).collect(Collectors.toList());
        this.filePath = filePath;
    }

    @Override
    public List<ApiEndpoint> getApiEndpoints() {
        return apiEndpoints;
    }

    @Override
    protected InputStream getFileInputStream(HttpExchange exchange) throws IOException {
        return ClassLoader.getSystemResourceAsStream(filePath);
    }

    @Override
    protected String getContentType(HttpExchange exchange) {
        String fileExt = FileUtils.getFileExtensionFromPath(filePath);
        return FileUtils.getContentTypeFromExtension(fileExt);
    }
}
