package cn.gloduck.api.service.torrent.handler;

import cn.gloduck.api.entity.config.TorrentConfig;
import cn.gloduck.api.entity.model.torrent.TorrentInfo;
import cn.gloduck.api.exceptions.ApiException;
import cn.gloduck.api.utils.DateUtils;
import cn.gloduck.api.utils.Patterns;
import cn.gloduck.api.utils.StringUtils;
import cn.gloduck.api.utils.UnitUtils;
import cn.gloduck.common.entity.base.ScrollPageResult;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class TokyoToshokanHandler extends AbstractTorrentHandler {
    private static final Pattern CUR_PAGE_INFO_NUMBER_PATTERN = Pattern.compile("Showing results (\\d+) to (\\d+) of (\\d+)");
    private static final Pattern CUR_PAGE_INFO_PATTERN = Pattern.compile("Showing results \\d+ to \\d+ of \\d+");

    public TokyoToshokanHandler(TorrentConfig torrentConfig, TorrentConfig.WebConfig config) {
        super(torrentConfig, config);
    }

    @Override
    public TorrentInfo queryDetail(String id) {
        String requestUrl = String.format("%s/details.php?id=%s", baseUrl, id);
        HttpRequest request = requestBuilder(requestUrl)
                .GET()
                .build();
        String response = sendRequest(request);
        if (response.contains("Entry not found")) {
            return null;
        }
        String uploadTimeStr = StringUtils.subBetween(response, "<li class=\"detailsleft shade\" id=\"detailsleft\">Date Submitted:</li>\n<li class=\"detailsright shade\">", "</li>");
        String fileSizeStr = StringUtils.subBetween(response, "<li class=\"detailsleft\">Filesize:</li>\n\t<li class=\"detailsright\">", "</li>");
        String fileNameContainer = StringUtils.subBetween(response, "<li class=\"detailsleft\">Torrent Name:</li>\n<li class=\"detailsright\">", "</li>");
        String name = Patterns.extractFirstCapturedGroupContent(fileNameContainer, Patterns.A_PATTERN).replace("<span class=\"s\"> </span>", "");
        String hash = StringUtils.subBetween(response, "Magnet Link</a>", "</li>").trim();
        TorrentInfo torrentInfo = new TorrentInfo();
        torrentInfo.setId(id);
        torrentInfo.setName(name);
        torrentInfo.setHash(hash.toUpperCase());
        torrentInfo.setSize(UnitUtils.convertSizeUnit(fileSizeStr));
        torrentInfo.setUploadTime(DateUtils.convertTimeStringToDate(uploadTimeStr, DateUtils.DASH_SEPARATED_DATE_TIME_FORMAT_PADDED_ZONE));
        torrentInfo.setFileCount(null);
        torrentInfo.setFiles(null);

        return torrentInfo;
    }

    @Override
    public ScrollPageResult<TorrentInfo> search(String keyword, Long index, String sortField, String sortOrder) {
        String requestUrl = String.format("%s/search.php?page=%s&searchComment=true&searchName=true&terms=%s", baseUrl, index, URLEncoder.encode(keyword, StandardCharsets.UTF_8));
        HttpRequest request = requestBuilder(requestUrl)
                .GET()
                .build();
        String response = sendRequest(request);
        if (response.contains("No results returned")) {
            return new ScrollPageResult<>(index, false, new ArrayList<>());
        }

        List<TorrentInfo> torrentInfos = new ArrayList<>(pageSize());
        String tbody = StringUtils.subBetween(response, "<table class=\"listing\">", "</table>");
        Matcher trMatcher = Patterns.TR_PATTERN.matcher(tbody);
        List<List<String>> mainInfoList = new ArrayList<>();
        List<List<String>> otherInfoList = new ArrayList<>();
        while (trMatcher.find()) {
            String tr = trMatcher.group();
            List<String> tds = new ArrayList<>();
            Matcher matcher = Patterns.TD_PATTERN.matcher(tr);
            while (matcher.find()) {
                tds.add(matcher.group(1));
            }
            if (tds.size() == 3) {
                mainInfoList.add(tds);
            }
            if (tds.size() == 2) {
                otherInfoList.add(tds);
            }
        }
        if (mainInfoList.size() != otherInfoList.size()) {
            throw new ApiException("Api response error data");
        }
        for (int i = 0; i < mainInfoList.size(); i++) {
            List<String> mainInfo = mainInfoList.get(i);
            List<String> otherInfo = otherInfoList.get(i);
            List<String> aTagContents = Patterns.extractFirstCapturedGroupContents(mainInfo.get(1), Patterns.A_PATTERN);
            String name = aTagContents.get(1).replace("<span class=\"s\"> </span>", "");
            Matcher hashMatcher = Patterns.MAGNET_HASH_PATTERN.matcher(mainInfo.get(1));
            String hash = hashMatcher.find() ? hashMatcher.group(1).toUpperCase() : null;
            String sizeStr = StringUtils.subBetween(otherInfo.get(0), "| Size: ", " |");
            String uploadTimeStr = StringUtils.subBetween(otherInfo.get(0), "| Date: ", " |");
            String id = StringUtils.subBetween(mainInfo.get(2), "\"details.php?id=", "\"");
            TorrentInfo torrentInfo = new TorrentInfo();
            torrentInfo.setId(id);
            torrentInfo.setName(name);
            torrentInfo.setHash(hash);
            torrentInfo.setSize(UnitUtils.convertSizeUnit(sizeStr));
            torrentInfo.setUploadTime(DateUtils.convertTimeStringToDate(uploadTimeStr, DateUtils.DASH_SEPARATED_DATE_TIME_FORMAT_PADDED_ZONE));
            torrentInfos.add(torrentInfo);
        }
        boolean hasNext = !isLastPage(response);
        // 第一页只有49条数据，补充一条虚拟数据，防止分页错误
        if(index == 1 && hasNext && torrentInfos.size() < pageSize()) {
            int leftSize = pageSize() - torrentInfos.size();
            for (int i = 0; i < leftSize; i++) {
                torrentInfos.add(torrentInfos.get(0));
            }
        }
        return new ScrollPageResult<>(index, hasNext, torrentInfos);
    }

    @Override
    public List<String> sortFields() {
        return Collections.emptyList();
    }

    @Override
    public String code() {
        return "TokyoToshokan";
    }

    @Override
    public List<String> tags() {
        return Arrays.asList("ACG", "JAV");
    }

    @Override
    public int pageSize() {
        return 50;
    }


    public static boolean isLastPage(String htmlContent) {
        if (htmlContent == null || htmlContent.isEmpty()) {
            return true;
        }
        Matcher matcher = CUR_PAGE_INFO_PATTERN.matcher(htmlContent);

        if (!matcher.find()) {
            return true;
        }
        String curPageInfo = matcher.group();

        Matcher numberMatcher = CUR_PAGE_INFO_NUMBER_PATTERN.matcher(curPageInfo);
        if (numberMatcher.matches()) {
            try {
                int endOfRange = Integer.parseInt(numberMatcher.group(2));
                int totalCount = Integer.parseInt(numberMatcher.group(3));
                return endOfRange >= totalCount;
            } catch (NumberFormatException e) {
                return true;
            }
        } else {
            return true;
        }
    }
}
