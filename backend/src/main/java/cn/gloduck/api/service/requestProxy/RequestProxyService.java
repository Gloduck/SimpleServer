package cn.gloduck.api.service.requestProxy;

import cn.gloduck.api.entity.config.ProxyRequestConfig;
import cn.gloduck.api.utils.NetUtils;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MultivaluedHashMap;
import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.StreamingOutput;
import jakarta.ws.rs.core.UriInfo;

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
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@ApplicationScoped
public class RequestProxyService {
    private static final String PROXY_HOST_KEY = "Proxy-Host";
    private static final String PROXY_CORS_KEY = "Proxy-Cors";
    private static final String PROXY_FOLLOW_REDIRECT_KEY = "Proxy-Follow-Redirect";
    private static final Set<String> IGNORE_REQUEST_PARAMETERS = new LinkedHashSet<>(Arrays.asList(
            PROXY_HOST_KEY,
            PROXY_CORS_KEY,
            PROXY_FOLLOW_REDIRECT_KEY));
    private static final Set<String> IGNORE_REQUEST_HEADERS = new LinkedHashSet<>(Arrays.asList(
            "Host",
            "Connection",
            "Content-Length",
            "Transfer-Encoding",
            "Upgrade",
            "Expect",
            PROXY_HOST_KEY,
            PROXY_CORS_KEY,
            PROXY_FOLLOW_REDIRECT_KEY));
    private static final Set<String> IGNORE_RESPONSE_HEADERS = new LinkedHashSet<>(Arrays.asList(
            "Connection",
            "Content-Length",
            "Transfer-Encoding"));

    private final HttpClient redirectHttpClient;
    private final HttpClient noRedirectHttpClient;

    public RequestProxyService(ProxyRequestConfig config) {
        this.redirectHttpClient = buildHttpClient(config, HttpClient.Redirect.NORMAL);
        this.noRedirectHttpClient = buildHttpClient(config, HttpClient.Redirect.NEVER);
    }

    public Response options(String path, HttpHeaders headers, UriInfo uriInfo) {
        MultivaluedMap<String, String> query = uriInfo.getQueryParameters();
        boolean enableCors = isCorsEnabled(headers, query);
        if (enableCors) {
            return withCors(Response.noContent()).build();
        }
        return proxy("OPTIONS", path, null, headers, uriInfo);
    }

    public Response proxy(String method, String path, InputStream body, HttpHeaders headers, UriInfo uriInfo) {
        MultivaluedMap<String, String> query = uriInfo.getQueryParameters();
        String proxyHost = getProxyHost(headers, query);
        if (isBlank(proxyHost)) {
            return Response.status(Response.Status.BAD_REQUEST).entity("Missing parameter or header: Proxy-Host").build();
        }

        boolean enableCors = isCorsEnabled(headers, query);
        boolean followRedirect = isRedirectEnabled(headers, query);
        URI targetUri;
        try {
            String scheme = resolveRequestScheme(headers, proxyHost);
            targetUri = buildTargetUri(proxyHost, scheme, path, filterRequestParameters(query));
        } catch (URISyntaxException e) {
            throw new RuntimeException(e);
        }

        HttpRequest.Builder requestBuilder = HttpRequest.newBuilder(targetUri)
                .method(method, buildRequestBodyPublisher(method, body, headers));
        copyRequestHeaders(headers.getRequestHeaders(), requestBuilder);

        HttpResponse<InputStream> response;
        try {
            HttpClient requestHttpClient = followRedirect ? redirectHttpClient : noRedirectHttpClient;
            response = requestHttpClient.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofInputStream());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Proxy request interrupted", e);
        } catch (IOException e) {
            throw new RuntimeException("Proxy request failed", e);
        }

        Response.ResponseBuilder responseBuilder = Response.status(response.statusCode());
        copyResponseHeaders(response.headers().map(), responseBuilder);
        if (enableCors) {
            withCors(responseBuilder);
        }
        StreamingOutput output = out -> copyAndClose(response.body(), out);
        return responseBuilder.entity(output).build();
    }

    private HttpRequest.BodyPublisher buildRequestBodyPublisher(String method, InputStream body, HttpHeaders headers) {
        if (body == null || "GET".equals(method) || "HEAD".equals(method)) {
            return HttpRequest.BodyPublishers.noBody();
        }
        HttpRequest.BodyPublisher publisher = HttpRequest.BodyPublishers.ofInputStream(() -> body);
        long contentLength = resolveContentLength(headers);
        return contentLength >= 0 ? HttpRequest.BodyPublishers.fromPublisher(publisher, contentLength) : publisher;
    }

    private long resolveContentLength(HttpHeaders headers) {
        String contentLength = getFirstHeader(headers, "Content-Length");
        if (isBlank(contentLength)) {
            return -1;
        }
        try {
            return Long.parseLong(contentLength);
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    private URI buildTargetUri(String proxyHost, String scheme, String path, MultivaluedMap<String, String> query)
            throws URISyntaxException {
        String authority = proxyHost;
        int schemeIndex = proxyHost.indexOf("://");
        if (schemeIndex > 0) {
            authority = proxyHost.substring(schemeIndex + 3);
        }
        String targetPath = path == null || path.isEmpty() ? "/" : "/" + path;
        return new URI(scheme, authority, targetPath, buildQuery(query), null);
    }

    private String buildQuery(MultivaluedMap<String, String> query) {
        if (query == null || query.isEmpty()) {
            return null;
        }
        StringBuilder builder = new StringBuilder();
        query.forEach((key, values) -> {
            for (String value : values) {
                if (builder.length() > 0) {
                    builder.append('&');
                }
                builder.append(key);
                if (value != null) {
                    builder.append('=').append(value);
                }
            }
        });
        return builder.toString();
    }

    private String resolveRequestScheme(HttpHeaders headers, String proxyHost) {
        int schemeIndex = proxyHost.indexOf("://");
        if (schemeIndex > 0) {
            return proxyHost.substring(0, schemeIndex);
        }
        String forwardedProto = getFirstHeader(headers, "X-Forwarded-Proto");
        return isBlank(forwardedProto) ? "http" : forwardedProto;
    }

    private MultivaluedMap<String, String> filterRequestParameters(MultivaluedMap<String, String> requestParameters) {
        MultivaluedMap<String, String> filteredParameters = new MultivaluedHashMap<>();
        requestParameters.forEach((key, values) -> {
            if (!IGNORE_REQUEST_PARAMETERS.contains(key)) {
                filteredParameters.put(key, values);
            }
        });
        return filteredParameters;
    }

    private void copyRequestHeaders(MultivaluedMap<String, String> headers, HttpRequest.Builder requestBuilder) {
        headers.forEach((header, values) -> {
            if (shouldIgnoreHeader(header, IGNORE_REQUEST_HEADERS)) {
                return;
            }
            for (String value : values) {
                requestBuilder.header(header, value);
            }
        });
    }

    private void copyResponseHeaders(Map<String, List<String>> sourceHeaders, Response.ResponseBuilder responseBuilder) {
        sourceHeaders.forEach((header, values) -> {
            if (shouldIgnoreHeader(header, IGNORE_RESPONSE_HEADERS)) {
                return;
            }
            for (String value : values) {
                responseBuilder.header(header, value);
            }
        });
    }

    private Response.ResponseBuilder withCors(Response.ResponseBuilder responseBuilder) {
        return responseBuilder
                .header("Access-Control-Allow-Origin", "*")
                .header("Access-Control-Allow-Methods", "*")
                .header("Access-Control-Allow-Headers", "*")
                .header("Access-Control-Expose-Headers", "*");
    }

    private boolean isCorsEnabled(HttpHeaders headers, MultivaluedMap<String, String> queryParameters) {
        String explicitEnabled = getFirstHeader(headers, PROXY_CORS_KEY);
        if (isBlank(explicitEnabled)) {
            explicitEnabled = queryParameters.getFirst(PROXY_CORS_KEY);
        }
        return isTruthy(explicitEnabled);
    }

    private boolean isRedirectEnabled(HttpHeaders headers, MultivaluedMap<String, String> queryParameters) {
        String explicitEnabled = getFirstHeader(headers, PROXY_FOLLOW_REDIRECT_KEY);
        if (isBlank(explicitEnabled)) {
            explicitEnabled = queryParameters.getFirst(PROXY_FOLLOW_REDIRECT_KEY);
        }
        return isTruthy(explicitEnabled);
    }

    private String getProxyHost(HttpHeaders headers, MultivaluedMap<String, String> queryParameters) {
        String explicitHost = getFirstHeader(headers, PROXY_HOST_KEY);
        if (isBlank(explicitHost)) {
            explicitHost = queryParameters.getFirst(PROXY_HOST_KEY);
        }
        return explicitHost;
    }

    private String getFirstHeader(HttpHeaders headers, String name) {
        List<String> values = headers.getRequestHeader(name);
        return values == null || values.isEmpty() ? null : values.get(0);
    }

    private boolean shouldIgnoreHeader(String header, Set<String> ignoredHeaders) {
        return ignoredHeaders.stream().anyMatch(ignored -> ignored.equalsIgnoreCase(header));
    }

    private boolean isTruthy(String value) {
        return "true".equalsIgnoreCase(value) || "1".equals(value) || "yes".equalsIgnoreCase(value);
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private void copyAndClose(InputStream inputStream, OutputStream outputStream) throws IOException {
        try (InputStream in = inputStream) {
            if (in == null) {
                return;
            }
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                outputStream.write(buffer, 0, read);
            }
        }
    }

    private HttpClient buildHttpClient(ProxyRequestConfig config, HttpClient.Redirect redirect) {
        String proxy = config.proxy;
        InetSocketAddress proxyAddress = NetUtils.buildProxyAddress(proxy == null || proxy.isBlank() ? null : proxy);
        HttpClient.Builder builder = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .followRedirects(redirect);
        if (proxyAddress != null) {
            builder.proxy(ProxySelector.of(proxyAddress));
        }
        return builder.build();
    }
}
