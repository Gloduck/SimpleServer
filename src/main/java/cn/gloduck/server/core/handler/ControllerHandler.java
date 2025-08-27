package cn.gloduck.server.core.handler;

import cn.gloduck.server.core.enums.HttpMethod;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.util.List;

public interface ControllerHandler {
    List<ApiEndpoint> getApiEndpoints();

    String getContentType(HttpExchange exchange);

    byte[] handleRequest(HttpExchange exchange) throws IOException;
}
