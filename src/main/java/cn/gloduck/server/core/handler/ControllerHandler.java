package cn.gloduck.server.core.handler;

import cn.gloduck.server.core.enums.HttpMethod;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;

public interface ControllerHandler {
    HttpMethod getHttpMethod();
    String getRequestPath();
    String getContentType(HttpExchange exchange);

    byte[] handleRequest(HttpExchange exchange) throws IOException;
}
