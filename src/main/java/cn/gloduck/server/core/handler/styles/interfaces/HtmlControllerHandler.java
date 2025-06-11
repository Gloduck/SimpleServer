package cn.gloduck.server.core.handler.styles.interfaces;

import cn.gloduck.server.core.handler.ControllerHandler;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

public interface HtmlControllerHandler extends ControllerHandler {
    @Override
    default String getContentType(HttpExchange exchange) {
        return "text/html;charset=utf-8";
    }

    @Override
    default byte[] handleRequest(HttpExchange exchange) throws IOException {
        String htmlContent = generateHtml(exchange);
        return htmlContent.getBytes(StandardCharsets.UTF_8);
    }

    String generateHtml(HttpExchange exchange) throws IOException;
}