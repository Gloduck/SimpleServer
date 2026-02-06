package cn.gloduck.api.utils;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class Patterns {
    public static final Pattern TABLE_PATTERN = Pattern.compile("<table\\b[^>]*>(.*?)</table>", Pattern.DOTALL);
    public static final Pattern TBODY_PATTERN = Pattern.compile("<tbody\\b[^>]*>(.*?)</tbody>", Pattern.DOTALL);
    public static final Pattern TR_PATTERN = Pattern.compile("<tr\\b[^>]*>(.*?)</tr>", Pattern.DOTALL);

    public static final Pattern TD_PATTERN = Pattern.compile("<td\\b[^>]*>(.*?)</td>", Pattern.DOTALL);
    public static final Pattern LI_PATTERN = Pattern.compile("<li\\b[^>]*>(.*?)</li>", Pattern.DOTALL);
    public static final Pattern A_PATTERN = Pattern.compile("<a\\b[^>]*>(.*?)</a>", Pattern.DOTALL);

    public static final Pattern SPAN_PATTERN = Pattern.compile("<span\\b[^>]*>(.*?)</span>", Pattern.DOTALL);

    public static final Pattern A_TAG_HREF_PATTERN = Pattern.compile("<a\\b[^>]*href=\"([^\"]+)\"[^>]*>");

    public static final Pattern DIV_PATTERN = Pattern.compile("<div\\b[^>]*>(.*?)</div>", Pattern.DOTALL);

    public static final Pattern MAGNET_HASH_PATTERN = Pattern.compile("magnet:\\?xt=urn:btih:([0-9a-zA-Z]{32,40})");


    /**
     * 从输入字符串中提取正则匹配的所有捕获组内容，去除首尾空格后返回列表
     *
     * @param input      待匹配的原始字符串
     * @param tagPattern 正则匹配模式（必须包含捕获组）
     * @return 处理后的匹配内容列表，无匹配/入参非法时返回空列表
     */
    public static List<String> extractCapturedGroupContents(String input, Pattern tagPattern) {

        List<String> result = new ArrayList<>();
        if (input == null || input.isEmpty() || tagPattern == null) {
            return result;
        }

        Matcher matcher = tagPattern.matcher(input);
        while (matcher.find()) {
            String content = matcher.group(0);
            content = content.trim();
            result.add(content);
        }
        return result;
    }

    /**
     * 从输入字符串中提取正则匹配的第一个捕获组内容，去除首尾空格后返回列表
     *
     * @param input      待匹配的原始字符串
     * @param tagPattern 正则匹配模式（必须包含第一个捕获组）
     * @return 处理后的匹配内容列表，无匹配/入参非法时返回空列表
     */
    public static List<String> extractFirstCapturedGroupContents(String input, Pattern tagPattern) {

        List<String> result = new ArrayList<>();
        if (input == null || input.isEmpty() || tagPattern == null) {
            return result;
        }

        Matcher matcher = tagPattern.matcher(input);
        while (matcher.find()) {
            String content = matcher.group(1);
            content = content.trim();
            result.add(content);
        }
        return result;
    }

    /**
     * 从输入字符串中提取正则匹配的第一个捕获组内容，去除首尾空格后返回内容
     *
     * @param input      待匹配的原始字符串
     * @param tagPattern 正则匹配模式（必须包含第一个捕获组）
     * @return 处理后的匹配内容，无匹配/入参非法时返回null
     */
    public static String extractFirstCapturedGroupContent(String input, Pattern tagPattern) {
        if (input == null || input.isEmpty() || tagPattern == null) {
            return null;
        }
        Matcher matcher = tagPattern.matcher(input);
        if (matcher.find()) {
            return matcher.group(1).trim();
        }
        return null;
    }

}
