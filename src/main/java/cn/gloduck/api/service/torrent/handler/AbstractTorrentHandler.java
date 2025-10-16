package cn.gloduck.api.service.torrent.handler;

import cn.gloduck.api.entity.config.TorrentConfig;
import cn.gloduck.api.exceptions.ApiException;
import cn.gloduck.api.utils.NetUtils;
import cn.gloduck.common.entity.base.Pair;
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
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.logging.Logger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public abstract class AbstractTorrentHandler implements TorrentHandler {
    private final static Logger LOGGER = Logger.getLogger(AbstractTorrentHandler.class.getName());
    private static final List<Pair<String, Long>> UNIT_MAP = new ArrayList<>() {{
        add(new Pair<>("pib", 1024L * 1024 * 1024 * 1024 * 1024));
        add(new Pair<>("tib", 1024L * 1024 * 1024 * 1024));
        add(new Pair<>("gib", 1024L * 1024 * 1024));
        add(new Pair<>("mib", 1024L * 1024));
        add(new Pair<>("kib", 1024L));
        add(new Pair<>("bytes", 1L));
        add(new Pair<>("pb", 1024L * 1024 * 1024 * 1024 * 1024));
        add(new Pair<>("tb", 1024L * 1024 * 1024 * 1024));
        add(new Pair<>("gb", 1024L * 1024 * 1024));
        add(new Pair<>("mb", 1024L * 1024));
        add(new Pair<>("kb", 1024L));
        add(new Pair<>("b", 1L));
    }};
    protected static final DateTimeFormatter SLASH_SEPARATED_DATE_TIME_FORMAT_NO_PAD = DateTimeFormatter.ofPattern("yyyy/MM/dd H:m");
    protected static final DateTimeFormatter SLASH_SEPARATED_DATE_TIME_FORMAT_PADDED = DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm");
    protected static final DateTimeFormatter DASH_SEPARATED_DATE_TIME_FORMAT_PADDED = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    protected static final DateTimeFormatter DASH_SEPARATED_DATE_TIME_FORMAT_PADDED_ZONE = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm z");
    protected static final DateTimeFormatter DASH_SEPARATED_DATE_TIME_FORMAT_NO_PAD = DateTimeFormatter.ofPattern("yyyy-MM-dd H:m");
    protected static final Pattern TABLE_PATTERN = Pattern.compile("<table\\b[^>]*>(.*?)</table>", Pattern.DOTALL);
    protected static final Pattern TBODY_PATTERN = Pattern.compile("<tbody\\b[^>]*>(.*?)</tbody>", Pattern.DOTALL);
    protected static final Pattern TR_PATTERN = Pattern.compile("<tr\\b[^>]*>(.*?)</tr>", Pattern.DOTALL);

    protected static final Pattern TD_PATTERN = Pattern.compile("<td\\b[^>]*>(.*?)</td>", Pattern.DOTALL);
    protected static final Pattern LI_PATTERN = Pattern.compile("<li\\b[^>]*>(.*?)</li>", Pattern.DOTALL);
    protected static final Pattern A_PATTERN = Pattern.compile("<a\\b[^>]*>(.*?)</a>", Pattern.DOTALL);

    protected static final Pattern DIV_PATTERN = Pattern.compile("<div\\b[^>]*>(.*?)</div>", Pattern.DOTALL);

    protected static final Pattern MAGNET_HASH_PATTERN = Pattern.compile("magnet:\\?xt=urn:btih:([0-9a-zA-Z]{32,40})");
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

    public static String getTagContent(String html, Pattern tagPattern) {
        if (html == null || html.isEmpty() || tagPattern == null) {
            return null;
        }
        Matcher matcher = tagPattern.matcher(html);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return null;
    }

    public static List<String> getTagContents(String html, Pattern tagPattern) {
        List<String> result = new ArrayList<>();

        if (html == null || html.isEmpty() || tagPattern == null) {
            return result;
        }

        Matcher matcher = tagPattern.matcher(html);

        while (matcher.find()) {
            String content = matcher.group(1);
            content = content.trim();
            result.add(content);
        }
        return result;
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
                            public X509Certificate[] getAcceptedIssuers() {
                                return null;
                            }

                            public void checkClientTrusted(X509Certificate[] certs, String authType) {
                            }

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

    protected Long convertSizeUnit(String sizeStr) {
        if (sizeStr == null) {
            return null;
        }
        sizeStr = sizeStr.trim().replace(" ", "").toLowerCase();
        for (Pair<String, Long> kv : UNIT_MAP) {
            if (sizeStr.endsWith(kv.getKey())) {
                return Math.round(Double.parseDouble(sizeStr.replace(kv.getKey(), "")) * kv.getValue());
            }
        }
        String numericStr = sizeStr.replaceAll("[^-+0-9.]", "");
        if (numericStr.indexOf('.') != numericStr.lastIndexOf('.')) {
            numericStr = numericStr.substring(0, numericStr.lastIndexOf('.'));
        }
        if (!Objects.equals(numericStr, sizeStr)) {
            LOGGER.warning(String.format("Exist Unresolved units: %s", sizeStr));
        }
        if (numericStr.isEmpty() || numericStr.equals("-") || numericStr.equals("+")) {
            return null;
        }
        return Math.round(Double.parseDouble(numericStr));
    }

    protected Date convertUploadTime(String uploadTimeStr, DateTimeFormatter formatter) {
        if (uploadTimeStr == null) {
            return null;
        }
        LocalDateTime localDateTime = LocalDateTime.parse(uploadTimeStr, formatter);

        ZonedDateTime zdt = localDateTime.atZone(ZoneId.of("Asia/Shanghai"));

        return Date.from(zdt.toInstant());
    }

    public AbstractTorrentHandler(TorrentConfig.WebConfig config) {
        this.baseUrl = config.url;
        this.requestTimeout = Optional.ofNullable(config.requestTimeout).orElse(5);
        this.validStatusTimeout = Optional.ofNullable(config.validStatusTimeout).orElse(1);
        this.httpClient = buildClient(config);
    }

}
