package cn.gloduck.server.core.util;

import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class FileUtils {
    /**
     * 支持多段后缀，如 tar.gz、tar.bz2、tar.xz 等。
     * 1) 去掉 URL 的 query 部分和锚点部分；
     * 2) 截取最后一个 "/" 之后的文件名；
     * 3) 遍历常见的 multi-part 后缀（按长度降序），优先匹配；否则取最后一个 "." 之后的部分。
     *
     * @param url 带有文件名的 URL
     * @return 不带点号的后缀；如果无后缀则返回空串
     */
    public static String getFileExtensionFromUrl(String url) {
        if (url == null || url.isEmpty()) {
            return "";
        }
        // 去掉 ? 和 # 之后的参数
        int q = url.indexOf('?');
        if (q != -1) {
            url = url.substring(0, q);
        }
        int h = url.indexOf('#');
        if (h != -1) {
            url = url.substring(0, h);
        }
        // 取最后一个 "/" 之后
        int slash = url.lastIndexOf('/');
        String filename = (slash >= 0) ? url.substring(slash + 1) : url;
        if (filename.isEmpty()) {
            return "";
        }
        filename = filename.toLowerCase(Locale.ROOT);

        // 常见的多段后缀，按长度降序排列，保证 longest-first
        String[] multiExts = {
                "tar.gz", "tar.bz2", "tar.xz", "tar.zst"
        };
        for (String me : multiExts) {
            if (filename.endsWith("." + me)) {
                return me;
            }
        }
        // 普通后缀：最后一个 "."
        int dot = filename.lastIndexOf('.');
        if (dot >= 0 && dot < filename.length() - 1) {
            return filename.substring(dot + 1);
        }
        return "";
    }

    /**
     * 根据文件后缀名获取最合适的 HTTP Content-Type。
     * 支持 80+ 种常见类型，查不到时返回 "application/octet-stream"。
     *
     * @param ext 文件后缀，可带或不带起始点，如 ".jpg" 或 "jpg"
     * @return 对应 Content-Type 字符串
     */
    public static String getContentTypeFromExtension(String ext) {
        if (ext == null || ext.isEmpty()) {
            return DEFAULT;
        }
        ext = ext.toLowerCase(Locale.ROOT);
        if (ext.startsWith(".")) {
            ext = ext.substring(1);
        }
        String ct = CONTENT_TYPES.get(ext);
        return (ct != null) ? ct : DEFAULT;
    }

    // 默认的 fallback
    private static final String DEFAULT = "application/octet-stream";

    // 静态初始化常见后缀→Content-Type 映射
    private static final Map<String, String> CONTENT_TYPES;

    static {
        Map<String, String> m = new HashMap<>();

        // 文本
        m.put("html", "text/html; charset=UTF-8");
        m.put("htm", "text/html; charset=UTF-8");
        m.put("css", "text/css; charset=UTF-8");
        m.put("js", "application/javascript; charset=UTF-8");
        m.put("json", "application/json; charset=UTF-8");
        m.put("xml", "application/xml; charset=UTF-8");
        m.put("txt", "text/plain; charset=UTF-8");
        m.put("csv", "text/csv; charset=UTF-8");
        m.put("md", "text/markdown; charset=UTF-8");

        // 图片
        m.put("png", "image/png");
        m.put("jpg", "image/jpeg");
        m.put("jpeg", "image/jpeg");
        m.put("gif", "image/gif");
        m.put("bmp", "image/bmp");
        m.put("webp", "image/webp");
        m.put("ico", "image/x-icon");
        m.put("svg", "image/svg+xml");
        m.put("tiff", "image/tiff");

        // 音视频
        m.put("mp3", "audio/mpeg");
        m.put("wav", "audio/wav");
        m.put("ogg", "audio/ogg");
        m.put("flac", "audio/flac");
        m.put("aac", "audio/aac");
        m.put("mp4", "video/mp4");
        m.put("m4v", "video/mp4");
        m.put("mov", "video/quicktime");
        m.put("avi", "video/x-msvideo");
        m.put("wmv", "video/x-ms-wmv");
        m.put("mkv", "video/x-matroska");
        m.put("webm", "video/webm");

        // 压缩与归档
        m.put("zip", "application/zip");
        m.put("tar", "application/x-tar");
        m.put("gz", "application/gzip");
        m.put("tgz", "application/gzip");
        m.put("tar.gz", "application/gzip");
        m.put("bz2", "application/x-bzip2");
        m.put("tar.bz2", "application/x-bzip2");
        m.put("xz", "application/x-xz");
        m.put("tar.xz", "application/x-xz");
        m.put("7z", "application/x-7z-compressed");
        m.put("rar", "application/vnd.rar");
        m.put("zst", "application/zstd");
        m.put("tar.zst", "application/zstd");

        // Office/文档
        m.put("pdf", "application/pdf");
        m.put("doc", "application/msword");
        m.put("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        m.put("xls", "application/vnd.ms-excel");
        m.put("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        m.put("ppt", "application/vnd.ms-powerpoint");
        m.put("pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
        m.put("odt", "application/vnd.oasis.opendocument.text");
        m.put("ods", "application/vnd.oasis.opendocument.spreadsheet");
        m.put("odp", "application/vnd.oasis.opendocument.presentation");
        m.put("rtf", "application/rtf");
        m.put("epub", "application/epub+zip");

        // 其他
        m.put("exe", "application/vnd.microsoft.portable-executable");
        m.put("apk", "application/vnd.android.package-archive");
        m.put("swf", "application/x-shockwave-flash");

        CONTENT_TYPES = Collections.unmodifiableMap(m);
    }

}
