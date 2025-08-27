package cn.gloduck.server.core.handler.special;

import cn.gloduck.server.core.handler.ControllerHandler;
import com.sun.net.httpserver.HttpExchange;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;

public abstract class FileHandler implements ControllerHandler {
    protected abstract InputStream getFileInputStream(HttpExchange exchange) throws IOException;

    protected abstract String getContentType(HttpExchange exchange);

    @Override
    public void handleRequest(HttpExchange exchange) throws IOException {
        String contentType = getContentType(exchange);
        exchange.getResponseHeaders().set("Content-Type", contentType);

        try (InputStream in = getFileInputStream(exchange)) {
            if (in == null) {
                throw new FileNotFoundException("Resource not found");
            }

            exchange.sendResponseHeaders(200, 0);

            byte[] buffer = new byte[8192];
            int bytesRead;
            try (var output = exchange.getResponseBody()) {
                while ((bytesRead = in.read(buffer)) != -1) {
                    output.write(buffer, 0, bytesRead);
                }
            }
        }
    }
}
