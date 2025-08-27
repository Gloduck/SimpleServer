package cn.gloduck.server.core.handler.styles.classes;

import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ApiEndpoint;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.function.Function;

public class HtmlControllerHandler extends AbstractControllerHandler<String> {


    public HtmlControllerHandler(HttpMethod method, String requestPath, Function<HttpExchange, String> handler) {
        super(method, requestPath, handler);
    }

    public HtmlControllerHandler(HttpMethod method, List<String> requestPaths, Function<HttpExchange, String> handler) {
        super(method, requestPaths, handler);
    }

    public HtmlControllerHandler(List<ApiEndpoint> endpoints, Function<HttpExchange, String> handler) {
        super(endpoints, handler);
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
