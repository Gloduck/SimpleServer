package cn.gloduck.api.service.torrent.handler;

import cn.gloduck.api.entity.config.TorrentConfig;
import cn.gloduck.api.exceptions.ApiException;
import cn.gloduck.api.utils.NetUtils;
import cn.gloduck.server.core.util.JsonUtils;
import com.fasterxml.jackson.databind.JsonNode;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.KeyManagementException;
import java.security.NoSuchAlgorithmException;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.Optional;
import java.util.logging.Logger;

public abstract class AbstractTorrentHandler implements TorrentHandler {
    private final static Logger LOGGER = Logger.getLogger(AbstractTorrentHandler.class.getName());

    protected final HttpClient httpClient;
    protected final String baseUrl;

    private final int requestTimeout;

    private final int validStatusTimeout;


    @Override
    public String url() {
        return baseUrl;
    }

    @Override
    public boolean checkAvailable() {
        return isWebsiteReachable(baseUrl);
    }

    protected boolean sortReverse(String order) {
        return "desc".equalsIgnoreCase(order);
    }


    public boolean isWebsiteReachable(String websiteUrl) {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(websiteUrl))
                .timeout(Duration.ofSeconds(validStatusTimeout))
                .GET()
                .build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return response.statusCode() == 200;
        } catch (IOException | InterruptedException e) {
            return false;
        }
    }

    private HttpClient buildClient(TorrentConfig.WebConfig config) {
        HttpClient.Builder builder = HttpClient.newBuilder();
        Integer timeout = Optional.ofNullable(config.connectTimeout).orElse(5);
        builder.connectTimeout(java.time.Duration.ofSeconds(timeout));
        InetSocketAddress proxyAddress = NetUtils.buildProxyAddress(config.proxy);
        if (proxyAddress != null) {
            builder.proxy(java.net.ProxySelector.of(proxyAddress));
        }
        Boolean trustAllCertificates = Optional.ofNullable(config.trustAllCertificates).orElse(false);
        if (trustAllCertificates) {
            SSLContext sslContext = null;
            try {
                sslContext = SSLContext.getInstance("TLS");
                sslContext.init(null, new TrustManager[]{
                        new X509TrustManager() {
                            @Override
                            public X509Certificate[] getAcceptedIssuers() {
                                return null;
                            }

                            @Override
                            public void checkClientTrusted(X509Certificate[] certs, String authType) {
                            }

                            @Override
                            public void checkServerTrusted(X509Certificate[] certs, String authType) {
                            }
                        }
                }, new java.security.SecureRandom());
                builder.sslContext(sslContext);
            } catch (NoSuchAlgorithmException | KeyManagementException e) {
                throw new RuntimeException(e);
            }
        }
        return builder.build();
    }

    public JsonNode sendJsonRequest(HttpRequest request) {
        String body = null;
        try {
            HttpResponse<String> response = httpClient.send(request, new StringBodyHandler());
            body = response.body();
            if (response.statusCode() != 200) {
                throw new RuntimeException(String.format("Server response error code: %s, response: %s", response.statusCode(), response.body()));
            }
            return JsonUtils.readTree(body);
        } catch (Exception e) {
            LOGGER.warning(String.format("Request [%s] Error: %s, response: %s", request.uri(), e.getMessage(), body));
            throw new ApiException("Request Api Error: " + e.getMessage());
        }
    }

    public String sendRequest(HttpRequest request) {
        String body = null;
        try {
            HttpResponse<String> response = httpClient.send(request, new StringBodyHandler());
            body = response.body();
            if (response.statusCode() != 200) {
                throw new RuntimeException(String.format("Server response error code: %s, response: %s", response.statusCode(), response.body()));
            }
            return body;
        } catch (Exception e) {
            LOGGER.warning(String.format("Request [%s] Error: %s, response: %s", request.uri(), e.getMessage(), body));
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

    public AbstractTorrentHandler(TorrentConfig.WebConfig config) {
        this.baseUrl = config.url;
        this.requestTimeout = Optional.ofNullable(config.requestTimeout).orElse(5);
        this.validStatusTimeout = Optional.ofNullable(config.validStatusTimeout).orElse(1);
        this.httpClient = buildClient(config);
    }

}
