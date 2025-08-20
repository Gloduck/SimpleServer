package cn.gloduck.api.service.torrent.handler;

import cn.gloduck.api.entity.config.TorrentConfig;
import cn.gloduck.api.exceptions.ApiException;
import cn.gloduck.server.core.util.JsonUtils;
import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.URL;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.Charset;
import java.util.Optional;

public abstract class AbstractTorrentHandler implements TorrentHandler {
    protected final HttpClient httpClient;
    protected final String baseUrl;

    private final String proxyAddress;

    private final int requestTimeout;

    private final int validStatusTimeout;


    @Override
    public String url() {
        return baseUrl;
    }

    @Override
    public boolean checkAvailable() {
        InetSocketAddress inetSocketAddress = buildProxyAddress();
        Proxy proxy = inetSocketAddress != null ? new Proxy(Proxy.Type.HTTP, inetSocketAddress) : null;
        return isWebsiteReachable(baseUrl, proxy, validStatusTimeout);
    }

    public static boolean isWebsiteReachable(String websiteUrl, Proxy proxy, int timeout) {
        try {
            URL url = new URL(websiteUrl);
            HttpURLConnection connection = proxy != null ? (HttpURLConnection) url.openConnection(proxy) : (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(timeout * 1000);
            connection.connect();

            int responseCode = connection.getResponseCode();
            return (responseCode == 200);
        } catch (IOException e) {
            return false;
        }
    }

    private InetSocketAddress buildProxyAddress() {
        if (proxyAddress == null || proxyAddress.isEmpty()) {
            return null;
        }
        String proxy = proxyAddress.replace("http://", "").replace("https://", "");
        String[] split = proxy.split(":");
        if (split.length == 2) {
            String host = split[0];
            Integer port = null;
            try {
                port = Integer.parseInt(split[1]);
            } catch (Exception ignore) {
            }
            if (port != null) {
                return new InetSocketAddress(host, port);
            }
        }
        return null;
    }


    private HttpClient buildClient(TorrentConfig.WebConfig config) {
        HttpClient.Builder builder = HttpClient.newBuilder();
        Integer timeout = Optional.ofNullable(config.getConnectTimeout()).orElse(5);
        builder.connectTimeout(java.time.Duration.ofSeconds(timeout));
        InetSocketAddress proxyAddress = buildProxyAddress();
        if (proxyAddress != null) {
            builder.proxy(java.net.ProxySelector.of(proxyAddress));
        }
        return builder.build();
    }

    public JsonNode sendJsonRequest(HttpRequest request) {
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(Charset.defaultCharset()));
            if (response.statusCode() != 200) {
                throw new RuntimeException(String.format("Server response error code: %s, response: %s", response.statusCode(), response.body()));
            }
            String responseBody = response.body();
            return JsonUtils.readTree(responseBody);
        } catch (Exception e) {
            throw new ApiException("Request Api Error: " + e.getMessage());
        }
    }

    public String sendRequest(HttpRequest request) {
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(Charset.defaultCharset()));
            if (response.statusCode() != 200) {
                throw new RuntimeException(String.format("Server response error code: %s, response: %s", response.statusCode(), response.body()));
            }
            return response.body();
        } catch (Exception e) {
            throw new ApiException("Request Api Error: " + e.getMessage());
        }
    }


    protected HttpRequest.Builder requestBuilder() {
        return HttpRequest.newBuilder()
                .timeout(java.time.Duration.ofSeconds(requestTimeout));
    }

    protected HttpRequest.Builder jsonRequestBuilder() {
        return HttpRequest.newBuilder()
                .timeout(java.time.Duration.ofSeconds(requestTimeout))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json");
    }

    protected Long convertSizeUnit(String sizeStr) {
        if (sizeStr == null) {
            return null;
        }
        sizeStr = sizeStr.trim().toLowerCase();
        if (sizeStr.endsWith("tb")) {
            return Math.round(Double.parseDouble(sizeStr.replace("tb", "")) * 1024 * 1024 * 1024 * 1024);
        } else if (sizeStr.endsWith("gb")) {
            return Math.round(Double.parseDouble(sizeStr.replace("gb", "")) * 1024 * 1024 * 1024);
        } else if (sizeStr.endsWith("mb")) {
            return Math.round(Double.parseDouble(sizeStr.replace("mb", "")) * 1024 * 1024);
        } else if (sizeStr.endsWith("kb")) {
            return Math.round(Double.parseDouble(sizeStr.replace("kb", "")) * 1024);
        } else {
            return Math.round(Double.parseDouble(sizeStr));
        }
    }

    public AbstractTorrentHandler(TorrentConfig.WebConfig config) {
        this.baseUrl = config.getUrl();
        this.proxyAddress = config.getProxy();
        this.requestTimeout = Optional.ofNullable(config.getRequestTimeout()).orElse(5);
        this.validStatusTimeout = Optional.ofNullable(config.getValidStatusTimeout()).orElse(1);
        this.httpClient = buildClient(config);
    }

}
