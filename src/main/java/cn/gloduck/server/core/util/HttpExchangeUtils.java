package cn.gloduck.server.core.util;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpsExchange;

import java.io.*;
import java.net.HttpCookie;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

public class HttpExchangeUtils {
    private static final Pattern IPv4_PATTERN =
            Pattern.compile("((25[0-5]|2[0-4]\\d|[01]?\\d?\\d)(\\.|$)){4}");
    private static final Pattern IPv6_PATTERN =
            Pattern.compile("([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}");

    public static byte[] getRequestBodyBytes(HttpExchange exchange) {
        try (InputStream is = exchange.getRequestBody();
             ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[1024];
            int len;
            while ((len = is.read(buffer)) != -1) {
                baos.write(buffer, 0, len);
            }
            return baos.toByteArray();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    public static String getRequestBodyString(HttpExchange exchange) {
        return getRequestBodyString(exchange, StandardCharsets.UTF_8);
    }

    public static String getRequestBodyString(HttpExchange exchange, Charset charset) {
        byte[] bytes = getRequestBodyBytes(exchange);
        return new String(bytes, charset);
    }

    public static String getBaseUrl(HttpExchange exchange) {
        String scheme = (exchange instanceof HttpsExchange) ? "https" : "http";

        String hostHeader = exchange.getRequestHeaders().getFirst("Host");
        String hostPort;
        if (hostHeader == null || hostHeader.isEmpty()) {
            InetSocketAddress local = exchange.getLocalAddress();
            hostPort = local.getAddress().getHostAddress() + ":" + local.getPort();
        } else {
            hostPort = hostHeader;
        }

        return scheme + "://" + hostPort;
    }

    public static boolean isIpAddress(String host) {
        return IPv4_PATTERN.matcher(host).matches()
                || IPv6_PATTERN.matcher(host).matches()
                || (host.startsWith("[") && host.endsWith("]")
                && IPv6_PATTERN.matcher(host.substring(1, host.length() - 1)).matches());
    }

    public static List<HttpCookie> getCookies(HttpExchange exchange) {
        List<HttpCookie> cookies = new ArrayList<>();
        List<String> cookieHeaders = exchange.getRequestHeaders().get("Cookie");
        if (cookieHeaders != null) {
            for (String header : cookieHeaders) {
                cookies.addAll(HttpCookie.parse(header));
            }
        }
        return cookies;
    }

    public static HttpCookie getCookie(HttpExchange exchange, String name) {
        for (HttpCookie cookie : getCookies(exchange)) {
            if (cookie.getName().equals(name)) {
                return cookie;
            }
        }
        return null;
    }

    public static Boolean getBooleanParameter(Map<String, List<String>> params, String name) {
        String value = getStringParameter(params, name);
        return value != null ? Boolean.parseBoolean(value) : null;
    }

    public static Integer getIntegerParameter(Map<String, List<String>> params, String name) {
        String value = getStringParameter(params, name);
        return value != null ? Integer.parseInt(value) : null;
    }

    public static Long getLongParameter(Map<String, List<String>> params, String name) {
        String value = getStringParameter(params, name);
        return value != null ? Long.parseLong(value) : null;
    }

    public static String getStringParameter(Map<String, List<String>> params, String name) {
        List<String> vs = params.get(name);
        if (vs != null && !vs.isEmpty()) {
            return vs.get(0);
        }
        return null;
    }

    public static Map<String, List<String>> getAllRequestParameters(HttpExchange exchange) {
        Map<String, List<String>> params = new LinkedHashMap<>();

        String query = exchange.getRequestURI().getRawQuery();
        if (query != null && !query.isEmpty()) {
            parseIntoMap(query, params);
        }
        String method = exchange.getRequestMethod();
        String contentType = exchange.getRequestHeaders()
                .getFirst("Content-Type");
        if ("post".equalsIgnoreCase(method)
                && contentType != null
                && contentType.contains("application/x-www-form-urlencoded")) {

            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(exchange.getRequestBody(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
            String body = sb.toString();
            if (!body.isEmpty()) {
                parseIntoMap(body, params);
            }
        }

        return params;
    }

    private static void parseIntoMap(String raw, Map<String, List<String>> params) {
        String[] pairs = raw.split("&");
        for (String pair : pairs) {
            int idx = pair.indexOf('=');
            String key, value;
            if (idx > 0) {
                key = urlDecode(pair.substring(0, idx));
                value = urlDecode(pair.substring(idx + 1));
            } else {
                key = urlDecode(pair);
                value = "";
            }
            params.computeIfAbsent(key, k -> new ArrayList<>()).add(value);
        }
    }

    public static void sendErrorResponse(HttpExchange exchange, int statusCode, String message) throws IOException {
        byte[] response = message.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(statusCode, response.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(response);
        }
    }

    private static String urlDecode(String s) {
        return URLDecoder.decode(s, StandardCharsets.UTF_8);
    }
}
