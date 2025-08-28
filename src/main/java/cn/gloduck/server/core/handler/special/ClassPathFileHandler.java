package cn.gloduck.server.core.handler.special;

import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ApiEndpoint;
import cn.gloduck.server.core.util.FileUtils;
import com.sun.net.httpserver.HttpExchange;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.JarURLConnection;
import java.net.URL;
import java.net.URLConnection;
import java.util.Arrays;
import java.util.List;
import java.util.jar.JarEntry;
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


    @Override
    protected Long getContentLength(HttpExchange exchange) {
        Long size = null;
        try {
            URL url = ClassLoader.getSystemResource(filePath);
            if (url != null) {
                if ("file".equals(url.getProtocol())) {
                    size = new File(url.getPath()).length();
                } else {
                    URLConnection connection = url.openConnection();
                    if (connection instanceof JarURLConnection) {
                        JarURLConnection jarConnection = (JarURLConnection) connection;
                        JarEntry entry = jarConnection.getJarEntry();
                        if (entry != null) {
                            size = entry.getSize();
                        }
                    } else {
                        size = connection.getContentLengthLong();
                    }
                }
            }
        } catch (IOException ignore) {
        }
        return size;
    }
}
