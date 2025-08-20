package cn.gloduck.api.service.torrent.handler;

import cn.gloduck.api.entity.config.TorrentConfig;
import cn.gloduck.api.entity.model.torrent.TorrentFileInfo;
import cn.gloduck.api.entity.model.torrent.TorrentInfo;
import cn.gloduck.api.exceptions.ApiException;
import cn.gloduck.api.utils.StringUtils;
import cn.gloduck.common.entity.base.ScrollPageResult;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class DmhyHandler extends AbstractTorrentHandler {
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy/MM/dd H:m");

    private static final Pattern TBODY_PATTERN = Pattern.compile("<tbody\\b[^>]*>(.*?)</tbody>", Pattern.DOTALL);
    private static final Pattern TR_PATTERN = Pattern.compile("<tr\\b[^>]*>(.*?)</tr>", Pattern.DOTALL);

    private static final Pattern TD_PATTERN = Pattern.compile("<td\\b[^>]*>(.*?)</td>", Pattern.DOTALL);
    private static final Pattern LI_PATTERN = Pattern.compile("<li\\b[^>]*>(.*?)</li>", Pattern.DOTALL);

    private static final Pattern MAGNET_HASH_PATTERN = Pattern.compile("magnet:\\?xt=urn:btih:([0-9a-zA-Z]{32,40})");

    public DmhyHandler(TorrentConfig.WebConfig config) {
        super(config);
    }

    @Override
    public TorrentInfo queryDetail(String id) {
        String requestUrl = String.format("%s/topics/view/%s.html", baseUrl, id);
        HttpRequest request = requestBuilder()
                .uri(URI.create(requestUrl))
                .GET()
                .build();
        String response = sendRequest(request);
        String uploadTimeStr = StringUtils.subBetween(response, "<li>發佈時間: <span>", "</span></li>");
        String sizeStr = StringUtils.subBetween(response, "<li>文件大小: <span>", "</span></li>");
        String hashStrContainer = StringUtils.subBetween(response, "<p><strong>Magnet連接:</strong>", "</p>");
        Matcher hashMatcher = MAGNET_HASH_PATTERN.matcher(hashStrContainer);
        String hash = hashMatcher.find() ? hashMatcher.group(1).toUpperCase() : null;
        String name = StringUtils.subBetween(response, "<title>", "</title>").replace(" - 動漫花園資源網 - 動漫愛好者的自由交流平台", "");

        TorrentInfo torrentInfo = new TorrentInfo();
        torrentInfo.setId(id);
        torrentInfo.setName(name);
        torrentInfo.setHash(hash);
        torrentInfo.setSize(convertSizeUnit(sizeStr));
        torrentInfo.setUploadTime(convertUploadTime(uploadTimeStr));
        List<TorrentFileInfo> torrentFileInfos = parseFileInfo(response);
        torrentInfo.setFileCount((long) torrentFileInfos.size());
        torrentInfo.setFiles(torrentFileInfos);

        return torrentInfo;
    }

    private List<TorrentFileInfo> parseFileInfo(String html){
        String fileListDiv = StringUtils.subBetween(html, "<div class=\"file_list\">", "</div>");
        List<TorrentFileInfo> fileList = new ArrayList<>();
        Matcher liMatcher = LI_PATTERN.matcher(fileListDiv);
        while (liMatcher.find()) {
            String li = liMatcher.group();
            String fileSizeStr = StringUtils.subBetween(li, "<span class=\"bt_file_size\">", "</span>");
            String imgField = "<img" + StringUtils.subBetween(li, "<img", ">") + ">";
            String fileSizeField = "<span class=\"bt_file_size\">" + fileSizeStr + "</span>";
            String fileName = StringUtils.subBetween(li, imgField, fileSizeField).trim();
            Long size = convertSizeUnit(fileSizeStr);
            TorrentFileInfo fileInfo = new TorrentFileInfo();
            fileInfo.setName(fileName);
            fileInfo.setSize(size);
            fileList.add(fileInfo);
        }
        return fileList;
    }

    @Override
    public ScrollPageResult<TorrentInfo> search(String keyword, Long index, String sortField, String sortOrder) {
        String requestUrl = String.format("%s/topics/list/page/%s?keyword=%s", baseUrl, index, URLEncoder.encode(keyword, StandardCharsets.UTF_8));
        HttpRequest request = requestBuilder()
                .uri(URI.create(requestUrl))
                .GET()
                .build();
        String response = sendRequest(request);
        if(response.contains("沒有可顯示資源")){
            return new ScrollPageResult<>(index, false, new ArrayList<>());
        }
        ArrayList<TorrentInfo> torrentInfos = new ArrayList<>(pageSize());
        Matcher tbodyMatcher = TBODY_PATTERN.matcher(response);
        if (!tbodyMatcher.find()) {
            throw new ApiException("Api response error data");
        }
        String tbody = tbodyMatcher.group(1);
        Matcher trMatcher = TR_PATTERN.matcher(tbody);
        while (trMatcher.find()) {
            String tr = trMatcher.group();
            List<String> tds = new ArrayList<>();
            Matcher matcher = TD_PATTERN.matcher(tr);
            while (matcher.find()) {
                tds.add(matcher.group(1));
            }
            if (tds.size() != 9) {
                continue;
            }
            String uploadTimeStr = StringUtils.subBetween(tds.get(0), "<span style=\"display: none;\">", "</span>");
            String id = StringUtils.subBetween(tds.get(2), "/topics/view/", ".html");
            String name = StringUtils.subBetween(tds.get(2), String.format("<a href=\"/topics/view/%s.html\"  target=\"_blank\" >", id), "</a>").trim().replace("<span class=\"keyword\">", "").replace("</span>", "");
            String sizeStr = tds.get(4).trim();
            Matcher hashMatcher = MAGNET_HASH_PATTERN.matcher(tds.get(3));
            String hash = hashMatcher.find() ? hashMatcher.group(1).toUpperCase() : null;
            TorrentInfo torrentInfo = new TorrentInfo();
            torrentInfo.setId(id);
            torrentInfo.setName(name);
            torrentInfo.setHash(hash);
            torrentInfo.setSize(convertSizeUnit(sizeStr));
            torrentInfo.setUploadTime(convertUploadTime(uploadTimeStr));
            torrentInfos.add(torrentInfo);
        }
        boolean hasNext = response.contains("/topics/list/page/" + (index + 1));
        return new ScrollPageResult<>(index, hasNext, torrentInfos);
    }

    private Date convertUploadTime(String uploadTimeStr) {
        if (uploadTimeStr == null) {
            return null;
        }
        LocalDateTime localDateTime = LocalDateTime.parse(uploadTimeStr, TIME_FORMATTER);

        ZonedDateTime zdt = localDateTime.atZone(ZoneId.of("Asia/Shanghai"));

        return Date.from(zdt.toInstant());
    }

    @Override
    public List<String> sortFields() {
        return List.of();
    }

    @Override
    public int pageSize() {
        return 80;
    }

    @Override
    public String code(){
        return "dmhy";
    }

    @Override
    public List<String> tags() {
        return Arrays.asList("ACG");
    }

}
