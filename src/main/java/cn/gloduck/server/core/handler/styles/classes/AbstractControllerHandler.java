package cn.gloduck.server.core.handler.styles.classes;

import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ControllerHandler;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.util.function.Function;

public abstract class AbstractControllerHandler<R> implements ControllerHandler {
    private final HttpMethod method;

    private final String requestPath;

    private final Function<HttpExchange, R> handler;

    public AbstractControllerHandler(HttpMethod method, String requestPath, Function<HttpExchange, R> handler) {
        this.method = method;
        this.requestPath = requestPath;
        this.handler = handler;
    }

    @Override
    public HttpMethod getHttpMethod() {
        return method;
    }

    @Override
    public String getRequestPath() {
        return requestPath;
    }

    protected abstract byte[] convertResult(R result) throws IOException;

    @Override
    public byte[] handleRequest(HttpExchange exchange) throws IOException {
        R result = this.handler.apply(exchange);
        return convertResult(result);
    }

}
