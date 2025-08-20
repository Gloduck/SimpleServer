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
import java.util.*;
import java.util.regex.Matcher;

public abstract class AbstractNyaaSiHandler extends AbstractTorrentHandler {
    public AbstractNyaaSiHandler(TorrentConfig.WebConfig config) {
        super(config);
    }

    @Override
    public TorrentInfo queryDetail(String id) {
        String requestUrl = String.format("%s/view/%s", baseUrl, id);
        HttpRequest request = requestBuilder()
                .uri(URI.create(requestUrl))
                .GET()
                .build();
        String response = sendRequest(request);
        if (response.contains("404 Not Found")) {
            return null;
        }
        String name = StringUtils.subBetween(response, "<h3 class=\"panel-title\">", "</h3>").trim();
        String uploadTimeStr = StringUtils.subBetween(response, "<div class=\"col-md-1\">Date:</div>", "</div>").replace("<div class=\"col-md-5\">", "").trim() + "</div>";
        uploadTimeStr = StringUtils.subBetween(uploadTimeStr, "data-timestamp=\"", "\"");
        String fileSizeStr = StringUtils.subBetween(response, "<div class=\"col-md-1\">File size:</div>", "</div>").replace("<div class=\"col-md-5\">", "").trim();
        String hash = StringUtils.subBetween(response, "<kbd>", "</kbd>").toUpperCase();
        List<TorrentFileInfo> torrentFileInfos = parseFileInfo(response);

        TorrentInfo torrentInfo = new TorrentInfo();
        torrentInfo.setId(id);
        torrentInfo.setName(name);
        torrentInfo.setHash(String.format("magnet:?xt=urn:btih:%s", hash));
        torrentInfo.setSize(convertSizeUnit(fileSizeStr));
        torrentInfo.setUploadTime(parseDate(uploadTimeStr));
        torrentInfo.setFileCount((long) torrentFileInfos.size());
        torrentInfo.setFiles(torrentFileInfos);

        return torrentInfo;
    }

    private List<TorrentFileInfo> parseFileInfo(String response) {
        String fileListDiv = StringUtils.subBetween(response, "<div class=\"torrent-file-list panel-body\">", "</div>");
        List<TorrentFileInfo> fileList = new ArrayList<>();
        Matcher liMatcher = LI_PATTERN.matcher(fileListDiv);
        while (liMatcher.find()) {
            String li = liMatcher.group();
            String fileName = StringUtils.subBetween(li, "<li><i class=\"fa fa-file\"></i>", "<span class=\"file-size\">").trim();
            String fileSize = StringUtils.subBetween(li, "<span class=\"file-size\">(", ")</span>").trim();
            TorrentFileInfo fileInfo = new TorrentFileInfo();
            fileInfo.setName(fileName);
            fileInfo.setSize(convertSizeUnit(fileSize));
            fileList.add(fileInfo);
        }
        return fileList;
    }

    private Date parseDate(String date) {
        if (date == null) {
            return null;
        }
        try {
            return new Date(Long.parseLong(date) * 1000);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    @Override
    public ScrollPageResult<TorrentInfo> search(String keyword, Long index, String sortField, String sortOrder) {
        sortField = convertSortFiled(sortField);
        keyword = URLEncoder.encode(keyword, StandardCharsets.UTF_8);
        String requestUrl;
        if (sortField != null) {
            requestUrl = String.format("%s/?q=%s&s=%s&o=%s&p=%d&c=0_0", baseUrl, keyword, sortField, sortOrder, index);
        } else {
            requestUrl = String.format("%s/?q=%s&p=%d&c=0_0", baseUrl, keyword, index);
        }
        HttpRequest request = requestBuilder()
                .uri(URI.create(requestUrl))
                .GET()
                .build();
        String response = sendRequest(request);
        if (response.contains("No results found")) {
            return new ScrollPageResult<>(index, false, new ArrayList<>());
        }
        List<TorrentInfo> torrentInfos = new ArrayList<>(pageSize());
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
            if (tds.size() != 8) {
                continue;
            }
            String id = StringUtils.subBetween(tds.get(1), "<a href=\"/view/", "\"");
            String name;
            if (id.contains("#comments")) {
                id = id.replace("#comments", "");
                List<String> tagContents = getTagContents(tds.get(1), A_PATTERN);
                name = tagContents.size() == 2 ? tagContents.get(1) : "";
            } else {
                name = getTagContent(tds.get(1), A_PATTERN);
            }
            String sizeStr = tds.get(3).trim();
            String uploadTimeStr = tds.get(4).trim();
            Matcher hashMatcher = MAGNET_HASH_PATTERN.matcher(tds.get(2));
            String hash = hashMatcher.find() ? hashMatcher.group(1).toUpperCase() : null;
            TorrentInfo torrentInfo = new TorrentInfo();
            torrentInfo.setId(id);
            torrentInfo.setName(name);
            torrentInfo.setHash(hash);
            torrentInfo.setSize(convertSizeUnit(sizeStr));
            torrentInfo.setUploadTime(convertUploadTime(uploadTimeStr, DASH_SEPARATED_DATE_TIME_FORMAT_PADDED));
            torrentInfos.add(torrentInfo);
        }
        boolean hasNext = !response.contains("class=\"next disabled\"");
        return new ScrollPageResult<>(index, hasNext, torrentInfos);
    }

    private String convertSortFiled(String sortField) {
        if (sortField == null) {
            return null;
        }
        return switch (sortField) {
            case "size" -> "size";
            case "uploadTime" -> "id";
            default -> null;
        };
    }

    @Override
    public List<String> sortFields() {
        return Arrays.asList("uploadTime", "size");
    }


    @Override
    public int pageSize() {
        return 75;
    }

}
