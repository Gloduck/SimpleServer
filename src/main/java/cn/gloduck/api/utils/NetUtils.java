package cn.gloduck.api.utils;

import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class NetUtils {
    public static InetSocketAddress buildProxyAddress(String proxyAddress) {
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


    /**
     * 获取URL中的参数值
     *
     * @param url       完整的URL字符串
     * @param paramName 要获取的参数名
     * @return 参数值。如果参数不存在返回null
     */
    public static String getParamValue(String url, String paramName) {
        return getParamValues(url, paramName).get(0);
    }

    /**
     * 解析URL中的查询参数
     *
     * @param url       完整的URL字符串
     * @param paramName 要获取的参数名
     * @return 参数值的列表。如果参数不存在返回空列表，如果参数存在但无值则包含null元素
     */
    public static List<String> getParamValues(String url, String paramName) {
        String queryString = extractQueryString(url);
        if (queryString == null || queryString.isEmpty()) {
            return Collections.emptyList();
        }

        Map<String, List<String>> paramsMap = parseQueryString(queryString);

        return paramsMap.getOrDefault(paramName, Collections.emptyList());
    }

    private static String extractQueryString(String url) {
        int queryStart = url.indexOf('?');
        if (queryStart == -1) {
            return null;
        }

        // 去掉片段标识符（#之后的内容）
        int fragmentStart = url.indexOf('#', queryStart);
        if (fragmentStart != -1) {
            return url.substring(queryStart + 1, fragmentStart);
        }
        return url.substring(queryStart + 1);
    }

    /**
     * 解析查询字符串为参数名-值对的映射
     *
     * @param queryString 查询字符串（不包含?）
     * @return 参数名-值对的映射
     */
    public static Map<String, List<String>> parseQueryString(String queryString) {
        Map<String, List<String>> paramsMap = new HashMap<>();

        String[] pairs = queryString.split("&");
        for (String pair : pairs) {
            String[] keyValue = pair.split("=", 2);
            String key = URLDecoder.decode(keyValue[0], StandardCharsets.UTF_8);

            String value = null;
            if (keyValue.length == 2 && !keyValue[1].isEmpty()) {
                value = URLDecoder.decode(keyValue[1], StandardCharsets.UTF_8);
            }

            paramsMap.computeIfAbsent(key, k -> new ArrayList<>()).add(value);

        }
        return paramsMap;
    }
}
