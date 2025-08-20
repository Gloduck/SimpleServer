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
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public abstract class AbstractTorrentHandler implements TorrentHandler {
    protected static final DateTimeFormatter SLASH_SEPARATED_DATE_TIME_FORMAT_NO_PAD = DateTimeFormatter.ofPattern("yyyy/MM/dd H:m");
    protected static final DateTimeFormatter SLASH_SEPARATED_DATE_TIME_FORMAT_PADDED = DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm");
    protected static final DateTimeFormatter DASH_SEPARATED_DATE_TIME_FORMAT_PADDED = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    protected static final DateTimeFormatter DASH_SEPARATED_DATE_TIME_FORMAT_NO_PAD = DateTimeFormatter.ofPattern("yyyy-MM-dd H:m");
    protected static final Pattern TBODY_PATTERN = Pattern.compile("<tbody\\b[^>]*>(.*?)</tbody>", Pattern.DOTALL);
    protected static final Pattern TR_PATTERN = Pattern.compile("<tr\\b[^>]*>(.*?)</tr>", Pattern.DOTALL);

    protected static final Pattern TD_PATTERN = Pattern.compile("<td\\b[^>]*>(.*?)</td>", Pattern.DOTALL);
    protected static final Pattern LI_PATTERN = Pattern.compile("<li\\b[^>]*>(.*?)</li>", Pattern.DOTALL);
    protected static final Pattern A_PATTERN = Pattern.compile("<a\\b[^>]*>(.*?)</a>", Pattern.DOTALL);

    protected static final Pattern MAGNET_HASH_PATTERN = Pattern.compile("magnet:\\?xt=urn:btih:([0-9a-zA-Z]{32,40})");
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
        sizeStr = sizeStr.trim().replace(" ", "").toLowerCase();
        if (sizeStr.endsWith("pb")) {
            return Math.round(Double.parseDouble(sizeStr.replace("pb", "")) * 1024 * 1024 * 1024 * 1024);
        } else if (sizeStr.endsWith("tb")) {
            return Math.round(Double.parseDouble(sizeStr.replace("tb", "")) * 1024 * 1024 * 1024);
        } else if (sizeStr.endsWith("gb")) {
            return Math.round(Double.parseDouble(sizeStr.replace("gb", "")) * 1024 * 1024 * 1024);
        } else if (sizeStr.endsWith("mb")) {
            return Math.round(Double.parseDouble(sizeStr.replace("mb", "")) * 1024 * 1024);
        } else if (sizeStr.endsWith("kb")) {
            return Math.round(Double.parseDouble(sizeStr.replace("kb", "")) * 1024);
        } else if (sizeStr.endsWith("pib")) {
            return Math.round(Double.parseDouble(sizeStr.replace("pib", "")) * 1024 * 1024 * 1024 * 1024);
        } else if (sizeStr.endsWith("tib")) {
            return Math.round(Double.parseDouble(sizeStr.replace("tib", "")) * 1024 * 1024 * 1024);
        } else if (sizeStr.endsWith("gib")) {
            return Math.round(Double.parseDouble(sizeStr.replace("gib", "")) * 1024 * 1024 * 1024);
        } else if (sizeStr.endsWith("mib")) {
            return Math.round(Double.parseDouble(sizeStr.replace("mib", "")) * 1024 * 1024);
        } else if (sizeStr.endsWith("kib")) {
            return Math.round(Double.parseDouble(sizeStr.replace("kib", "")) * 1024);
        } else if(sizeStr.endsWith("b")) {
            return Math.round(Double.parseDouble(sizeStr.replace("b", "")));
        } else {
            return Math.round(Double.parseDouble(sizeStr));
        }
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
        this.baseUrl = config.getUrl();
        this.proxyAddress = config.getProxy();
        this.requestTimeout = Optional.ofNullable(config.getRequestTimeout()).orElse(5);
        this.validStatusTimeout = Optional.ofNullable(config.getValidStatusTimeout()).orElse(1);
        this.httpClient = buildClient(config);
    }

}
