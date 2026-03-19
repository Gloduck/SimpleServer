package cn.gloduck.server.core.handler.special;

import cn.gloduck.api.utils.NetUtils;
import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ApiEndpoint;
import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.util.HttpExchangeUtils;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Proxy;
import java.net.URL;
import java.util.*;
import java.util.stream.Collectors;

public class ForwardHandler implements ControllerHandler {
    private static final List<String> IGNORE_REQUEST_HEADERS = Arrays.asList("Host", "Connection", "Content-Length", "Referer");


    private static final List<String> IGNORE_RESPONSE_HEADERS = Arrays.asList("Connection");

    private static final List<HttpMethod> SUPPORT_BODY_METHODS = Arrays.asList(HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH);

    private final List<ApiEndpoint> endpoints;

    private final String urlParamKey;

    private Proxy proxy = null;

    public void setProxy(Proxy proxy) {
        this.proxy = proxy;
    }

    public ForwardHandler(String requestPath, String urlParamKey) {
        this(requestPath, urlParamKey, List.of(HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.DELETE, HttpMethod.PATCH, HttpMethod.HEAD));
    }

    public ForwardHandler(String requestPath, String urlParamKey, List<HttpMethod> methods) {
        this.urlParamKey = urlParamKey;
        this.endpoints = methods.stream().map(t -> new ApiEndpoint(t, requestPath)).collect(Collectors.toList());
    }

    @Override
    public List<ApiEndpoint> getApiEndpoints() {
        return endpoints;
    }

    @Override
    public void handleRequest(HttpExchange exchange) throws IOException {
        String query = exchange.getRequestURI().getRawQuery();
        List<String> urls = NetUtils.parseQueryString(query).getOrDefault(urlParamKey, Collections.emptyList());
        if (urls == null || urls.isEmpty()) {
            HttpExchangeUtils.sendErrorResponse(exchange, 400, "Missing parameter: " + urlParamKey);
            return;
        }
        String realRequestUrl = urls.get(0);
        URL url = new URL(realRequestUrl);
        HttpURLConnection connection = proxy != null ? (HttpURLConnection) url.openConnection(proxy) : (HttpURLConnection) url.openConnection();

        // 设置请求方法
        connection.setRequestMethod(exchange.getRequestMethod());
        connection.setInstanceFollowRedirects(true);
        connection.setUseCaches(false);


        // 转发请求头
        forwardRequestHeaders(exchange, connection);

        // 处理有请求体的情况（如POST、PUT等）
        handleRequestBody(exchange, connection);

        // 获取目标服务器响应并转发给客户端
        forwardResponse(connection, exchange);
    }

    /**
     * 转发请求头到目标服务器
     */
    private void forwardRequestHeaders(HttpExchange exchange, HttpURLConnection connection) {
        exchange.getRequestHeaders().forEach((header, values) -> {
            for (String ignoreRequestHeader : IGNORE_REQUEST_HEADERS) {
                if (header.equalsIgnoreCase(ignoreRequestHeader)) {
                    return;
                }
            }
            values.forEach(value -> connection.addRequestProperty(header, value));
        });
    }


    private void handleRequestBody(HttpExchange exchange, HttpURLConnection connection) throws IOException {
        String method = exchange.getRequestMethod();
        // 对于有请求体的方法，需要处理请求体
        if (!needRequestBody(method)) {
            return;
        }

        // 允许输出
        connection.setDoOutput(true);

        // 获取请求体并转发
        try (InputStream requestBody = exchange.getRequestBody();
             OutputStream out = connection.getOutputStream()) {

            byte[] buffer = new byte[4096];
            int bytesRead;
            while ((bytesRead = requestBody.read(buffer)) != -1) {
                out.write(buffer, 0, bytesRead);
            }
        }
    }


    /**
     * 将目标服务器的响应转发给客户端
     */
    private void forwardResponse(HttpURLConnection connection, HttpExchange exchange) throws IOException {
        int responseCode = connection.getResponseCode();

        forwardResponseHeader(connection, exchange);

        InputStream responseBody = responseCode >= 400 ?
                connection.getErrorStream() : connection.getInputStream();

        if (responseBody == null) {
            exchange.sendResponseHeaders(responseCode, 0);
            return;
        }
        long contentLength = parseContentLength(connection.getHeaderFields());

        exchange.sendResponseHeaders(responseCode, contentLength);

        try (OutputStream clientOut = exchange.getResponseBody()) {
            byte[] buffer = new byte[4096];
            int bytesRead;
            while ((bytesRead = responseBody.read(buffer)) != -1) {
                clientOut.write(buffer, 0, bytesRead);
            }
        }

        responseBody.close();
    }

    private static void forwardResponseHeader(HttpURLConnection connection, HttpExchange exchange) {
        Map<String, List<String>> responseHeaders = connection.getHeaderFields();
        // 转发响应头
        responseHeaders.forEach((header, values) -> {
            if (header == null) {
                return;
            }
            for (String ignoreResponseHeader : IGNORE_RESPONSE_HEADERS) {
                if (header.equalsIgnoreCase(ignoreResponseHeader)) {
                    return;
                }
            }
            values.forEach(value -> exchange.getResponseHeaders().add(header, value));
        });
    }

    private long parseContentLength(Map<String, List<String>> responseHeaders) {
        List<String> contentLengths = responseHeaders.get("Content-Length");
        if (contentLengths == null || contentLengths.isEmpty()) {
            return 0;
        }
        return Long.parseLong(contentLengths.get(0));
    }

    private boolean needRequestBody(String method) {
        return SUPPORT_BODY_METHODS.contains(HttpMethod.valueOf(method.toUpperCase()));
    }
}
