package cn.gloduck.api.service.torrent.handler;

import cn.gloduck.api.entity.config.TorrentConfig;
import cn.gloduck.api.exceptions.ApiException;
import cn.gloduck.common.entity.base.Pair;
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
        this.baseUrl = config.getUrl();
        this.proxyAddress = config.getProxy();
        this.requestTimeout = Optional.ofNullable(config.getRequestTimeout()).orElse(5);
        this.validStatusTimeout = Optional.ofNullable(config.getValidStatusTimeout()).orElse(1);
        this.httpClient = buildClient(config);
    }

}
