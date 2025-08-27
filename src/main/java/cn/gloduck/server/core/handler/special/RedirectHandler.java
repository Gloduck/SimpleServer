package cn.gloduck.server.core.handler.special;

import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ApiEndpoint;
import cn.gloduck.server.core.handler.ControllerHandler;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

public abstract class RedirectHandler implements ControllerHandler {
    private final List<ApiEndpoint> apiEndpoints;
    private final String redirectPath;

    public abstract int getRedirectCode();

    public RedirectHandler(String matchPath, String redirectPath) {
        this(Arrays.asList(matchPath), redirectPath);
    }

    public RedirectHandler(List<String> matchPaths, String redirectPath) {
        this.apiEndpoints = matchPaths.stream().map(t -> new ApiEndpoint(HttpMethod.GET, t)).collect(Collectors.toList());
        this.redirectPath = redirectPath;
    }

    @Override
    public final List<ApiEndpoint> getApiEndpoints() {
        return apiEndpoints;
    }

    @Override
    public void handleRequest(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Location", redirectPath);
        exchange.sendResponseHeaders(getRedirectCode(), 0);
    }

}
