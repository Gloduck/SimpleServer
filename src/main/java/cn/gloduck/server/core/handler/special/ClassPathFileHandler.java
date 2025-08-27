package cn.gloduck.server.core.handler.special;

import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ApiEndpoint;
import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.util.FileUtils;
import com.sun.net.httpserver.HttpExchange;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

public class ClassPathFileHandler implements ControllerHandler {
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
    public String getContentType(HttpExchange exchange) {
        String fileExt = FileUtils.getFileExtensionFromPath(filePath);
        return FileUtils.getContentTypeFromExtension(fileExt);
    }

    @Override
    public byte[] handleRequest(HttpExchange exchange) throws IOException {
        byte[] readBytes;
        try (InputStream in = ClassLoader.getSystemResourceAsStream(filePath)) {
            if (in == null) {
                throw new FileNotFoundException("File not found: " + filePath);
            }
            readBytes = in.readAllBytes();
        }
        return readBytes;
    }
}
