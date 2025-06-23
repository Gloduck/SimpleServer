package cn.gloduck.server.core.util;

import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class FileUtils {
    private final static String[] MULTI_EXTENSIONS = {
            ".tar.gz", ".tar.bz2", ".tar.xz", ".tar.Z", ".tar.lz", ".tar.lzma", "tar.zst"
    };

    public static String getFileExtensionFromPath(String path) {
        // 处理空路径
        if (path == null || path.isEmpty()) {
            return "";
        }

        // 提取文件名部分（忽略路径分隔符）
        String filename = extractFileName(path);
        if (filename.isEmpty()) {
            return "";
        }


        // 转换为小写以进行不区分大小写的匹配
        String lowercaseFilename = filename.toLowerCase();

        // 检查多重扩展名
        for (String ext : MULTI_EXTENSIONS) {
            if (lowercaseFilename.endsWith(ext)) {
                // 从原始文件名中截取实际扩展名（保留原始大小写）
                return filename.substring(filename.length() - ext.length());
            }
        }

        // 处理标准扩展名（最后一个点之后的部分）
        int lastDotIndex = filename.lastIndexOf('.');
        // 排除点位于开头或结尾的情况
        if (lastDotIndex <= 0 || lastDotIndex == filename.length() - 1) {
            return "";
        }
        return filename.substring(lastDotIndex);
    }

    private static String extractFileName(String path) {
        int lastSeparator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
        if (lastSeparator >= 0) {
            return path.substring(lastSeparator + 1);
        }
        return path;
    }

    public static String getFileExtensionFromUrl(String url) {
        if (url == null || url.isEmpty()) {
            return "";
        }

        // 移除URL中的查询参数和片段标识符
        String cleanPath = removeQueryAndFragment(url);

        // 从清理后的路径中提取文件名
        String filename = extractFileNameFromUrl(cleanPath);
        if (filename.isEmpty()) {
            return "";
        }

        // 使用文件名处理逻辑获取扩展名
        return getExtensionFromFileName(filename);
    }

    // 移除URL中的查询参数(?之后)和片段标识符(#之后)
    private static String removeQueryAndFragment(String url) {
        // 先移除片段标识符
        int fragmentIndex = url.indexOf('#');
        if (fragmentIndex != -1) {
            url = url.substring(0, fragmentIndex);
        }

        // 再移除查询参数
        int queryIndex = url.indexOf('?');
        if (queryIndex != -1) {
            url = url.substring(0, queryIndex);
        }

        return url;
    }

    // 从URL路径中提取文件名（最后一个'/'之后的内容）
    private static String extractFileNameFromUrl(String urlPath) {
        // 处理以斜杠结尾的情况
        if (urlPath.endsWith("/")) {
            return "";
        }

        int lastSlashIndex = urlPath.lastIndexOf('/');
        if (lastSlashIndex >= 0) {
            return urlPath.substring(lastSlashIndex + 1);
        }
        // 无路径分隔符
        return urlPath;
    }

    // 核心方法：从纯文件名中提取扩展名
    private static String getExtensionFromFileName(String filename) {

        String lowercaseFilename = filename.toLowerCase();

        // 检查多重扩展名
        for (String ext : MULTI_EXTENSIONS) {
            if (lowercaseFilename.endsWith(ext)) {
                return filename.substring(filename.length() - ext.length());
            }
        }

        // 处理标准扩展名
        int lastDotIndex = filename.lastIndexOf('.');
        if (lastDotIndex <= 0 || lastDotIndex == filename.length() - 1) {
            return "";
        }
        return filename.substring(lastDotIndex);
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
