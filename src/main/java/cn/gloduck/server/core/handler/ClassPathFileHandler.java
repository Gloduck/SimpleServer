package cn.gloduck.server.core.handler;

import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.util.FileUtils;
import com.sun.net.httpserver.HttpExchange;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;

public class ClassPathFileHandler implements ControllerHandler {
    private final HttpMethod method;

    private final String requestPath;

    private final String filePath;

    public ClassPathFileHandler(HttpMethod method, String requestPath, String filePath) {
        this.method = method;
        this.requestPath = requestPath;
        this.filePath = filePath;
    }

    @Override
    public HttpMethod getHttpMethod() {
        return method;
    }

    @Override
    public String getRequestPath() {
        return requestPath;
    }

    @Override
    public String getContentType(HttpExchange exchange) {
        String fileExt = FileUtils.getFileExtensionFromPath(filePath);
        return FileUtils.getContentTypeFromExtension(fileExt);
    }

    @Override
    public byte[] handleRequest(HttpExchange exchange) throws IOException {
        byte[] readBytes;
        try (InputStream in = ClassLoader.getSystemResourceAsStream(filePath)){
            if(in == null){
                throw new FileNotFoundException("File not found: " + filePath);
            }
            readBytes = in.readAllBytes();
        }
        return readBytes;
    }
}
