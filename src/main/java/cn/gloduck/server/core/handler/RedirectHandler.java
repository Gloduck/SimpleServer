package cn.gloduck.server.core.handler;

import cn.gloduck.server.core.enums.HttpMethod;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
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
    public final String getContentType(HttpExchange exchange) {
        return null;
    }

    @Override
    public final byte[] handleRequest(HttpExchange exchange) throws IOException {
        return redirectPath.getBytes(StandardCharsets.UTF_8);
    }
}
