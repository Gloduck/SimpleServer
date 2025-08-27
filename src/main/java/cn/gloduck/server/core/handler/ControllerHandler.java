package cn.gloduck.server.core.handler;

import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.util.List;

public interface ControllerHandler {
    List<ApiEndpoint> getApiEndpoints();

    void handleRequest(HttpExchange exchange) throws IOException;
}
