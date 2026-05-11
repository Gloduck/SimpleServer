package cn.gloduck.server.core.handler.special;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ProxySelector;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpsExchange;

import cn.gloduck.api.utils.NetUtils;
import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ApiEndpoint;
import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.util.HttpExchangeUtils;

public class RequestProxyHandler implements ControllerHandler {
    private static final String PROXY_HOST_KEY = "Proxy-Host";
    private static final String PROXY_ENABLE_CORS_KEY = "Proxy-Enable-Cors";
    private static final Set<String> IGNORE_REQUEST_PARAMETERS = new LinkedHashSet<>(Arrays.asList(
            PROXY_HOST_KEY,
            PROXY_ENABLE_CORS_KEY));
    private static final Set<String> IGNORE_REQUEST_HEADERS = new LinkedHashSet<>(Arrays.asList(
            "Host",
            "Connection",
            "Content-Length",
            "Transfer-Encoding",
            "Upgrade",
            "Expect",
            PROXY_HOST_KEY,
            PROXY_ENABLE_CORS_KEY));
    private static final Set<String> IGNORE_RESPONSE_HEADERS = new LinkedHashSet<>(Arrays.asList(
            "Connection",
            "Content-Length",
            "Transfer-Encoding"));

    private final List<ApiEndpoint> endpoints;
    private final String requestPathPrefix;
    private final HttpClient httpClient;

    public RequestProxyHandler(String requestPathPrefix) {
        this(requestPathPrefix, (InetSocketAddress) null);
    }

    public RequestProxyHandler(String requestPathPrefix, String proxyAddress) {
        this(requestPathPrefix, NetUtils.buildProxyAddress(proxyAddress));
    }

    public RequestProxyHandler(String requestPathPrefix, InetSocketAddress proxyAddress) {
        this.requestPathPrefix = requestPathPrefix;
        this.endpoints = Arrays.stream(HttpMethod.values())
                .map(method -> new ApiEndpoint(method, requestPathPrefix + "/**"))
                .collect(Collectors.toList());
        HttpClient.Builder builder = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NEVER);
        if (proxyAddress != null) {
            builder.proxy(ProxySelector.of(proxyAddress));
        }
        this.httpClient = builder.build();
    }

    @Override
    public List<ApiEndpoint> getApiEndpoints() {
        return endpoints;
    }

    @Override
    public void handleRequest(HttpExchange exchange) throws IOException {
        Map<String, List<String>> queryParameters = HttpExchangeUtils.parseRequestParameters(exchange.getRequestURI().getRawQuery());
        String proxyHost = getProxyHost(exchange, queryParameters);
        if (isBlank(proxyHost)) {
            HttpExchangeUtils.sendErrorResponse(exchange, 400, "Missing parameter or header: Proxy-Host");
            return;
        }

        boolean enableCors = isCorsEnabled(exchange, queryParameters);
        if (enableCors && isPreflightRequest(exchange)) {
            writePreflightResponse(exchange);
            return;
        }

        String scheme = resolveRequestScheme(exchange, proxyHost);
        URI targetUri;
        try {
            String requestQuery = HttpExchangeUtils.buildRequestQuery(filterRequestParameters(queryParameters));
            targetUri = buildTargetUri(proxyHost, scheme, exchange.getRequestURI().getRawPath(), requestQuery);
        } catch (URISyntaxException e) {
            throw new RuntimeException(e);
        }

        HttpRequest.Builder requestBuilder = HttpRequest.newBuilder(targetUri)
                .method(exchange.getRequestMethod(), buildRequestBodyPublisher(exchange));
        copyRequestHeaders(exchange.getRequestHeaders(), requestBuilder);

        HttpResponse<InputStream> response;
        try {
            response = httpClient.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofInputStream());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Proxy request interrupted", e);
        }

        writeResponseToExchange(exchange, response, enableCors);
    }

    private HttpRequest.BodyPublisher buildRequestBodyPublisher(HttpExchange exchange) {
        String contentLength = exchange.getRequestHeaders().getFirst("Content-Length");
        String transferEncoding = exchange.getRequestHeaders().getFirst("Transfer-Encoding");
        if (isBlank(contentLength) && isBlank(transferEncoding)) {
            return HttpRequest.BodyPublishers.noBody();
        }
        return HttpRequest.BodyPublishers.ofInputStream(exchange::getRequestBody);
    }

    private URI buildTargetUri(String proxyHost, String scheme, String rawPath, String filteredQuery)
            throws URISyntaxException {
        String authority = proxyHost;
        int schemeIndex = proxyHost.indexOf("://");
        if (schemeIndex > 0) {
            authority = proxyHost.substring(schemeIndex + 3);
        }
        String path = rawPath.substring(requestPathPrefix.length());
        if (path.isEmpty()) {
            path = "/";
        }
        return new URI(scheme, authority, path, filteredQuery == null || filteredQuery.isBlank() ? null : filteredQuery,
                null);
    }

    private String resolveRequestScheme(HttpExchange exchange, String proxyHost) {
        if (!isBlank(proxyHost)) {
            int schemeIndex = proxyHost.indexOf("://");
            if (schemeIndex > 0) {
                return proxyHost.substring(0, schemeIndex);
            }
        }
        String forwardedProto = exchange.getRequestHeaders().getFirst("X-Forwarded-Proto");
        if (!isBlank(forwardedProto)) {
            return forwardedProto;
        }
        return exchange instanceof HttpsExchange ? "https" : "http";
    }

    private Map<String, List<String>> filterRequestParameters(Map<String, List<String>> requestParameters) {
        Map<String, List<String>> filteredParameters = new LinkedHashMap<>();
        requestParameters.forEach((key, values) -> {
            if (IGNORE_REQUEST_PARAMETERS.contains(key)) {
                return;
            }
            filteredParameters.put(key, new ArrayList<>(values));
        });
        return filteredParameters;
    }

    private void copyRequestHeaders(Headers headers, HttpRequest.Builder requestBuilder) {
        headers.forEach((header, values) -> {
            if (shouldIgnoreHeader(header, IGNORE_REQUEST_HEADERS)) {
                return;
            }
            for (String value : values) {
                requestBuilder.header(header, value);
            }
        });
    }

    private void copyResponseHeaders(Map<String, List<String>> sourceHeaders, Headers targetHeaders) {
        sourceHeaders.forEach((header, values) -> {
            if (shouldIgnoreHeader(header, IGNORE_RESPONSE_HEADERS)) {
                return;
            }
            for (String value : values) {
                targetHeaders.add(header, value);
            }
        });
    }

    private void writeResponseToExchange(HttpExchange exchange, HttpResponse<InputStream> response, boolean enableCors)
            throws IOException {
        copyResponseHeaders(response.headers().map(), exchange.getResponseHeaders());
        applyCorsHeaders(exchange, enableCors);
        long contentLength = parseContentLength(response.headers().map());
        exchange.sendResponseHeaders(response.statusCode(), contentLength);
        try (InputStream responseBody = response.body(); OutputStream outputStream = exchange.getResponseBody()) {
            if (responseBody == null) {
                return;
            }
            byte[] buffer = new byte[8192];
            int read;
            while ((read = responseBody.read(buffer)) != -1) {
                outputStream.write(buffer, 0, read);
            }
        }
    }

    private void writePreflightResponse(HttpExchange exchange) throws IOException {
        applyCorsHeaders(exchange, true);
        exchange.sendResponseHeaders(204, -1);
    }

    private void applyCorsHeaders(HttpExchange exchange, boolean enableCors) {
        if (!enableCors) {
            return;
        }
        Headers responseHeaders = exchange.getResponseHeaders();
        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Access-Control-Allow-Methods", "*");
        responseHeaders.set("Access-Control-Allow-Headers", "*");
        responseHeaders.set("Access-Control-Expose-Headers", "*");
    }

    private boolean isCorsEnabled(HttpExchange exchange, Map<String, List<String>> queryParameters) {
        String explicitEnabled = HttpExchangeUtils.getFirstNonBlankHeader(exchange, PROXY_ENABLE_CORS_KEY);
        if (isBlank(explicitEnabled)) {
            explicitEnabled = HttpExchangeUtils.getStringParameter(queryParameters, PROXY_ENABLE_CORS_KEY);
        }
        return isTruthy(explicitEnabled);
    }

    private String getProxyHost(HttpExchange exchange, Map<String, List<String>> queryParameters) {
        String explicitHost = HttpExchangeUtils.getFirstNonBlankHeader(exchange, PROXY_HOST_KEY);
        if (isBlank(explicitHost)) {
            explicitHost = HttpExchangeUtils.getStringParameter(queryParameters, PROXY_HOST_KEY);
        }
        return explicitHost;
    }

    private boolean isPreflightRequest(HttpExchange exchange) {
        return "OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())
                && !isBlank(exchange.getRequestHeaders().getFirst("Access-Control-Request-Method"));
    }

    private long parseContentLength(Map<String, List<String>> headers) {
        for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
            if (!"Content-Length".equalsIgnoreCase(entry.getKey())) {
                continue;
            }
            if (entry.getValue().isEmpty()) {
                return 0;
            }
            String value = entry.getValue().get(0);
            if (isBlank(value)) {
                return 0;
            }
            try {
                return Long.parseLong(value);
            } catch (NumberFormatException ignore) {
                return 0;
            }
        }
        return 0;
    }

    private boolean shouldIgnoreHeader(String header, Set<String> ignoreHeaders) {
        if (header == null) {
            return true;
        }
        for (String ignoreHeader : ignoreHeaders) {
            if (header.equalsIgnoreCase(ignoreHeader)) {
                return true;
            }
        }
        return false;
    }

    private boolean isTruthy(String value) {
        if (isBlank(value)) {
            return false;
        }
        return Objects.equals("1", value)
                || "true".equalsIgnoreCase(value)
                || "yes".equalsIgnoreCase(value)
                || "on".equalsIgnoreCase(value);
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
