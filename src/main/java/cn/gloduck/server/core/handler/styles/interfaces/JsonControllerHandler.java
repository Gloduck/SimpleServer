package cn.gloduck.server.core.handler.styles.interfaces;

import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.util.JsonUtils;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;

public interface JsonControllerHandler extends ControllerHandler {
    @Override
    default byte[] handleRequest(HttpExchange exchange) throws IOException {
        Object response = handleJsonRequest(exchange);
        return JsonUtils.writeValueAsBytes(response);
    }

    Object handleJsonRequest(HttpExchange exchange) throws IOException;

    @Override
    default String getContentType(HttpExchange exchange) {
        return "application/json;charset=utf-8";
    }
}
