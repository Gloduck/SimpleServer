package cn.gloduck.server.core.handler;

import cn.gloduck.server.core.enums.HttpMethod;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

public abstract class RedirectHandler implements ControllerHandler {
    private final String matchPath;
    private final String redirectPath;

    public abstract int getRedirectCode();

    public RedirectHandler(String matchPath, String redirectPath) {
        this.matchPath = matchPath;
        this.redirectPath = redirectPath;
    }

    @Override
    public HttpMethod getHttpMethod() {
        return HttpMethod.GET;
    }

    @Override
    public String getRequestPath() {
        return matchPath;
    }

    @Override
    public String getContentType(HttpExchange exchange) {
        return null;
    }

    @Override
    public byte[] handleRequest(HttpExchange exchange) throws IOException {
        return redirectPath.getBytes(StandardCharsets.UTF_8);
    }
}
