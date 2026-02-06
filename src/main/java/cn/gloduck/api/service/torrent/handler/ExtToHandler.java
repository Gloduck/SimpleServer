package cn.gloduck.api.service.torrent.handler;

import cn.gloduck.api.entity.config.TorrentConfig;
import cn.gloduck.api.entity.model.torrent.TorrentFileInfo;
import cn.gloduck.api.entity.model.torrent.TorrentInfo;
import cn.gloduck.api.exceptions.ApiException;
import cn.gloduck.api.utils.NetUtils;
import cn.gloduck.api.utils.Patterns;
import cn.gloduck.api.utils.StringUtils;
import cn.gloduck.api.utils.UnitUtils;
import cn.gloduck.common.entity.base.ScrollPageResult;
import com.fasterxml.jackson.databind.JsonNode;

import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ExtToHandler extends AbstractTorrentHandler {
    private static final int DEFAULT_PAGE_SIZE = 50;

    private static final Pattern TIME_AGO_PATTERN = Pattern.compile("^.*?(\\d+)\\s+(\\w+)\\s+ago.*$", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern NAME_IGNORE_STR_PATTERN = Pattern.compile("（检索：.*?）");
    private static final Pattern PAGE_TOKEN_PATTERN = Pattern.compile("window\\.pageToken\\s*=\\s*'([^']+)';?", Pattern.CASE_INSENSITIVE);
    private static final Pattern CSRF_TOKEN_PATTERN = Pattern.compile("window\\.csrfToken\\s*=\\s*'([^']+)';?", Pattern.CASE_INSENSITIVE);

    public static String computeHMAC(String torrentId, long timestamp, String token) {
        String data = torrentId + "|" + Long.toString(timestamp) + "|" + token;

        MessageDigest digest = null;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("Failed to get SHA-256 MessageDigest instance", e);
        }
        byte[] hashBytes = digest.digest(data.getBytes(StandardCharsets.UTF_8));

        return bytesToHex(hashBytes);
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder hexString = new StringBuilder();
        for (byte b : bytes) {
            // 转换为两位十六进制，不足补0
            String hex = Integer.toHexString(0xff & b);
            if (hex.length() == 1) {
                hexString.append('0');
            }
            hexString.append(hex);
        }
        return hexString.toString();
    }

    public static Date parseTimeAgo(String strIncludeTime) {
        Date date = null;
        if (strIncludeTime == null || strIncludeTime.isBlank()) {
            return date;
        }

        Matcher matcher = TIME_AGO_PATTERN.matcher(strIncludeTime.trim());
        if (!matcher.matches()) {
            return date;
        }

        try {
            long amount = Long.parseLong(matcher.group(1));
            String unit = matcher.group(2).toLowerCase().replaceAll("s$", "");
            ChronoUnit chronoUnit = switch (unit) {
                case "second" -> ChronoUnit.SECONDS;
                case "minute" -> ChronoUnit.MINUTES;
                case "hour" -> ChronoUnit.HOURS;
                case "day" -> ChronoUnit.DAYS;
                case "month" -> ChronoUnit.MONTHS;
                case "year" -> ChronoUnit.YEARS;
                default -> null;
            };
            if (chronoUnit != null) {
                ZonedDateTime now = ZonedDateTime.now();
                ZonedDateTime targetTime = now.minus(amount, chronoUnit);

                date = Date.from(targetTime.toInstant());
            }

        } catch (NumberFormatException ignore) {
        }
        return date;
    }

    public ExtToHandler(TorrentConfig torrentConfig, TorrentConfig.WebConfig config) {
        super(torrentConfig, config);
    }

    @Override
    public TorrentInfo queryDetail(String id) {
        String requestUrl = String.format("%s/%s/", baseUrl, id);
        HttpRequest request = requestBuilder(requestUrl)
                .GET().build();
        String response = sendPlainTextRequest(request);
        String sizeStr = StringUtils.subBetween(response, "<span class=\"content-size\">Size:", "</span>");
        sizeStr = sizeStr != null ? sizeStr.trim() : null;
        String name = StringUtils.subBetween(response, "<h1 class=\"card-title\">", "</h1>");
        name = NAME_IGNORE_STR_PATTERN.matcher(name).replaceAll("").trim();
        String strIncludeTime = StringUtils.subBetween(response, "<div class=\"col-12 detail-torrent-poster-info\">", "</div>");
        Date uploadTime = parseTimeAgo(strIncludeTime);
        String pageToken = Patterns.extractFirstCapturedGroupContent(response, PAGE_TOKEN_PATTERN);
        String csrfToken = Patterns.extractFirstCapturedGroupContent(response, CSRF_TOKEN_PATTERN);
        String torrentId = extractTorrentId(id);
        long timestamp = System.currentTimeMillis() / 1000;
        String hmac = computeHMAC(torrentId, timestamp, pageToken);
        HttpRequest fetchHashRequest = requestBuilder(String.format("%s/ajax/getTorrentMagnet.php", baseUrl))
                .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
                .POST(HttpRequest.BodyPublishers.ofString(String.format("torrent_id=%s&action=get_magnet&timestamp=%s&hmac=%s&sessid=%s", torrentId, timestamp, hmac, csrfToken))).build();
        JsonNode jsonNode = sendJsonRequest(fetchHashRequest);
        if (!jsonNode.path("success").asBoolean(false)) {
            throw new ApiException("Failed to get torrent hash");
        }

        TorrentInfo torrentInfo = new TorrentInfo();
        torrentInfo.setId(id);
        torrentInfo.setName(name);
        torrentInfo.setSize(UnitUtils.convertSizeUnit(sizeStr));
        torrentInfo.setUploadTime(uploadTime);
        torrentInfo.setFileCount(null);
        torrentInfo.setFiles(null);

        torrentInfo.setHash(Patterns.extractFirstCapturedGroupContent(jsonNode.path("magnet").asText(""), Patterns.MAGNET_HASH_PATTERN).toUpperCase());

        return torrentInfo;
    }

    public static String extractTorrentId(String fullId) {
        if (fullId == null || fullId.isBlank()) {
            return null;
        }
        int lastDashIndex = fullId.lastIndexOf("-");
        if (lastDashIndex == -1 || lastDashIndex == fullId.length() - 1) {
            return null;
        }
        return fullId.substring(lastDashIndex + 1).trim();
    }

    @Override
    public ScrollPageResult<TorrentInfo> search(String keyword, Long index, String sortField, String sortOrder) {
        String requestUrl = String.format("%s/browse/", baseUrl);
        Map<String, String> param = new HashMap<>(8);
        param.put("page", String.valueOf(index));
        param.put("page_size", String.valueOf(DEFAULT_PAGE_SIZE));
        param.put("q", keyword);
        param.put("with_adult", "1");
        HttpRequest request = requestBuilder(NetUtils.buildParamUrl(requestUrl, param))
                .GET().build();
        String response = sendPlainTextRequest(request);


        String table = StringUtils.subBetween(response, "<table class=\"table table-striped table-hover search-table\">", "</table>");
        if (StringUtils.isNullOrEmpty(table)) {
            return new ScrollPageResult<>(index, false, new ArrayList<>());
        }
        List<TorrentInfo> torrentInfos = new ArrayList<>(DEFAULT_PAGE_SIZE);
        String tbody = StringUtils.subBetween(table, "<tbody>", "</tbody>");
        List<String> records = Patterns.extractFirstCapturedGroupContents(tbody, Patterns.TR_PATTERN);
        for (String record : records) {
            TorrentInfo torrentInfo = new TorrentInfo();
            List<String> recordTds = Patterns.extractFirstCapturedGroupContents(record, Patterns.TD_PATTERN);
            for (String recordTd : recordTds) {
                if (recordTd.contains("<span class=\"add-block\">")) {
                    List<String> spanContents = Patterns.extractFirstCapturedGroupContents(recordTd, Patterns.SPAN_PATTERN);
                    if (spanContents.size() != 2) {
                        continue;
                    }
                    String content = spanContents.get(1);
                    if (Objects.equals("Size", spanContents.get(0))) {
                        torrentInfo.setSize(UnitUtils.convertSizeUnit(content));
                    }
                    if (Objects.equals("Age", spanContents.get(0))) {
                        torrentInfo.setUploadTime(parseTimeAgo(content));
                    }
                } else if (recordTd.contains("torrent-title-link")) {
                    String href = Patterns.extractFirstCapturedGroupContent(recordTd, Patterns.A_TAG_HREF_PATTERN);
                    String id = href.substring(1, href.length() - 1);
                    torrentInfo.setId(id);
                    String a = Patterns.extractFirstCapturedGroupContent(recordTd, Patterns.A_PATTERN);
                    if (a != null) {
                        String name = StringUtils.subBetween(a, "<b>", "</b>");
                        name = name != null ? name.replaceAll("<span>", "").replaceAll("</span>", "") : "";
                        name = name.trim();
                        torrentInfo.setName(name);
                    }
                }
            }

            // 列表页无法获取Hash
            torrentInfo.setHash(null);
            torrentInfos.add(torrentInfo);
        }
        boolean hasMore = false;
        String ul = StringUtils.subBetween(response, "<ul class=\"pages\">", "</ul>");
        if (ul != null) {
            List<String> lis = Patterns.extractCapturedGroupContents(ul, Patterns.LI_PATTERN);
            if (!lis.isEmpty()) {
                hasMore = !lis.get(lis.size() - 1).contains("active");
            }
        }
        return new ScrollPageResult<>(index, hasMore, torrentInfos);
    }

    @Override
    public String url() {
        return "https://ext.to";
    }

    @Override
    public List<String> sortFields() {
        return List.of();
    }

    @Override
    public String code() {
        return "extTo";
    }

    @Override
    public List<String> tags() {
        return Arrays.asList("ALL");
    }

    @Override
    public int pageSize() {
        return DEFAULT_PAGE_SIZE;
    }
}
