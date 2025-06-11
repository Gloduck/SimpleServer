package cn.gloduck.server.core.handler.styles.classes;

import cn.gloduck.server.core.enums.HttpMethod;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.function.Function;

public class HtmlControllerHandler extends AbstractControllerHandler<String> {
    public HtmlControllerHandler(HttpMethod method, String requestPath, Function<HttpExchange, String> handler) {
        super(method, requestPath, handler);
    }

    @Override
    protected byte[] convertResult(String result) throws IOException {
        return result.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public String getContentType(HttpExchange exchange) {
        return "text/html;charset=utf-8";
    }
}
