package cn.gloduck.server.core.handler.styles.classes;

import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ApiEndpoint;
import cn.gloduck.server.core.handler.ControllerHandler;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.List;
import java.util.function.Function;
import java.util.stream.Collectors;

public abstract class AbstractControllerHandler<R> implements ControllerHandler {
    private final List<ApiEndpoint> apiEndpoints;

    private final Function<HttpExchange, R> handler;

    public AbstractControllerHandler(HttpMethod method, String requestPath, Function<HttpExchange, R> handler) {
        this(Arrays.asList(new ApiEndpoint(method, requestPath)), handler);
    }

    public AbstractControllerHandler(HttpMethod method, List<String> requestPaths, Function<HttpExchange, R> handler) {
        this(requestPaths.stream().map(path -> new ApiEndpoint(method, path)).collect(Collectors.toList()), handler);
    }

    public AbstractControllerHandler(List<ApiEndpoint> endpoints, Function<HttpExchange, R> handler) {
        this.apiEndpoints = endpoints;
        this.handler = handler;
    }

    @Override
    public final List<ApiEndpoint> getApiEndpoints() {
        return apiEndpoints;
    }

    protected abstract byte[] convertResult(R result) throws IOException;

    protected abstract String getContentType(HttpExchange exchange);

    @Override
    public final void handleRequest(HttpExchange exchange) throws IOException {
        R result = this.handler.apply(exchange);
        byte[] resultBytes = convertResult(result);
        sendResponse(exchange, getContentType(exchange), resultBytes);
    }


    private void sendResponse(HttpExchange exchange, String contentType, byte[] data) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.sendResponseHeaders(200, data.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(data);
        }
    }

}
