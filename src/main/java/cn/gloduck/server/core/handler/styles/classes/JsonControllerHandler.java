package cn.gloduck.server.core.handler.styles.classes;

import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ApiEndpoint;
import cn.gloduck.server.core.util.JsonUtils;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.util.List;
import java.util.function.Function;

public class JsonControllerHandler<R> extends AbstractControllerHandler<R>{


    public JsonControllerHandler(HttpMethod method, String requestPath, Function<HttpExchange, R> handler) {
        super(method, requestPath, handler);
    }

    public JsonControllerHandler(HttpMethod method, List<String> requestPaths, Function<HttpExchange, R> handler) {
        super(method, requestPaths, handler);
    }

    public JsonControllerHandler(List<ApiEndpoint> endpoints, Function<HttpExchange, R> handler) {
        super(endpoints, handler);
    }

    @Override
    protected byte[] convertResult(R result) throws IOException {
        return JsonUtils.writeValueAsBytes(result);
    }

    @Override
    public String getContentType(HttpExchange exchange) {
        return "application/json;charset=utf-8";
    }
}
