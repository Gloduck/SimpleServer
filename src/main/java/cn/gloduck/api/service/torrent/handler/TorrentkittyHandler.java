package cn.gloduck.api.service.torrent.handler;

import cn.gloduck.api.entity.config.TorrentConfig;
import cn.gloduck.api.entity.model.torrent.TorrentFileInfo;
import cn.gloduck.api.entity.model.torrent.TorrentInfo;
import cn.gloduck.api.utils.DateUtils;
import cn.gloduck.api.utils.Patterns;
import cn.gloduck.api.utils.StringUtils;
import cn.gloduck.api.utils.UnitUtils;
import cn.gloduck.common.entity.base.ScrollPageResult;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Matcher;

public class TorrentkittyHandler extends AbstractTorrentHandler {

    public TorrentkittyHandler(TorrentConfig torrentConfig, TorrentConfig.WebConfig config) {
        super(torrentConfig, config);
    }

    @Override
    public TorrentInfo queryDetail(String id) {
        String requestUrl = String.format("%s/information/%s", baseUrl, id);
        HttpRequest request = requestBuilder(requestUrl)
                .GET()
                .build();
        String response = sendRequest(request);
        String detailTable = StringUtils.subBetween(response, "<table class=\"detailSummary\">", "</table>");
        TorrentInfo torrentInfo = new TorrentInfo();
        String name = StringUtils.subBetween(detailTable, "<h2>", "</h2>");
        name = name != null ? name.trim() : "";
        torrentInfo.setId(id);
        torrentInfo.setName(name);
        // 正则读取tr，然后遍历
        Matcher trMatcher = Patterns.TR_PATTERN.matcher(detailTable);
        while (trMatcher.find()) {
            String tr = trMatcher.group();
            String content = null;
            Matcher tdMatcher = Patterns.TD_PATTERN.matcher(tr);
            if (tdMatcher.find()) {
                content = tdMatcher.group(1);
            }
            if (content == null) {
                continue;
            }
            content = content.trim();
            if (tr.contains("Torrent Hash:")) {
                torrentInfo.setHash(content);
            }
            if (tr.contains("Number of Files:")) {
                torrentInfo.setFileCount(Long.parseLong(content));
            }
            if (tr.contains("Content Size:")) {
                torrentInfo.setSize(UnitUtils.convertSizeUnit(content));
            }
            if (tr.contains("Created On:")) {
                torrentInfo.setUploadTime(parseDateStr(content));
            }
        }

        List<TorrentFileInfo> files = parseFileList(response);


        torrentInfo.setFiles(files);

        return torrentInfo;
    }

    private Date parseDateStr(String dateStr) {
        if (dateStr == null) {
            return null;
        }
        dateStr += " 00:00:00";
        return DateUtils.convertTimeStringToDate(dateStr, DateUtils.DASH_SEPARATED_DATE_TIME_FORMAT);
    }

    private List<TorrentFileInfo> parseFileList(String html) {
        String tableArea = StringUtils.subBetween(html, "<table id=\"torrentDetail\">", "</table>");
        if (tableArea == null) {
            return Collections.emptyList();
        }

        List<TorrentFileInfo> fileList = new ArrayList<>();
        Matcher trMatcher = Patterns.TR_PATTERN.matcher(tableArea);
        boolean isFirst = true;
        while (trMatcher.find()) {
            if (isFirst) {
                isFirst = false;
                continue;
            }
            String tr = trMatcher.group();
            String fileName = StringUtils.subBetween(tr, "<td class=\"name\">", "</td>");
            String fileSize = StringUtils.subBetween(tr, "<td class=\"size\">", "</td>");
            if (fileName == null) {
                continue;
            }
            fileName = fileName.trim();
            fileSize = fileSize.trim();
            TorrentFileInfo fileInfo = new TorrentFileInfo();
            fileInfo.setName(fileName);
            fileInfo.setSize(UnitUtils.convertSizeUnit(fileSize));
            fileList.add(fileInfo);
        }
        return fileList;
    }

    @Override
    public ScrollPageResult<TorrentInfo> search(String keyword, Long index, String sortField, String sortOrder) {
        String requestUrl = String.format("%s/search/%s/%d", baseUrl, URLEncoder.encode(keyword, StandardCharsets.UTF_8), index);
        HttpRequest request = requestBuilder(requestUrl)
                .GET()
                .build();
        String response = sendRequest(request);

        if (response.contains("No result")) {
            return new ScrollPageResult<>(index, false, new ArrayList<>());
        }

        ArrayList<TorrentInfo> torrentInfos = new ArrayList<>(pageSize());
        String tbody = StringUtils.subBetween(response, "<table id=\"archiveResult\">", "</table>");
        if (tbody == null) {
            return new ScrollPageResult<>(index, false, new ArrayList<>());
        }

        Matcher trMatcher = Patterns.TR_PATTERN.matcher(tbody);
        while (trMatcher.find()) {
            String tr = trMatcher.group();
            String name = StringUtils.subBetween(tr, "<td class=\"name\">", "</td>");
            String size = StringUtils.subBetween(tr, "<td class=\"size\">", "</td>");
            String date = StringUtils.subBetween(tr, "<td class=\"date\">", "</td>");
            String action = StringUtils.subBetween(tr, "<td class=\"action\">", "</td>");


            String hash = StringUtils.subBetween(action, "/information/", "\"");
            if (hash == null) {
                continue;
            }

            if (name == null) {
                name = hash;
            }

            String sizeStr = size.trim();
            String dateStr = date.trim();

            TorrentInfo torrentInfo = new TorrentInfo();
            torrentInfo.setId(hash);
            torrentInfo.setName(name);
            torrentInfo.setHash(hash.toUpperCase());
            torrentInfo.setSize(UnitUtils.convertSizeUnit(sizeStr));
            torrentInfo.setUploadTime(parseDateStr(dateStr));
            torrentInfos.add(torrentInfo);
        }
        String pageElement = StringUtils.subBetween(response, "<div class=\"pagination\">", "</div>");
        boolean isEnd = pageElement == null || pageElement.isEmpty() || pageElement.contains("<span class=\"disabled\">»</span>");
        return new ScrollPageResult<>(index, !isEnd, torrentInfos);
    }

    @Override
    public List<String> sortFields() {
        return Collections.emptyList();
    }

    @Override
    public int pageSize() {
        return 20;
    }

    @Override
    public String code() {
        return "torrentkitty";
    }

    @Override
    public List<String> tags() {
        return Arrays.asList("ALL");
    }
}
