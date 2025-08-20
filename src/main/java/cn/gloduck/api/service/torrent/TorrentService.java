package cn.gloduck.api.service.torrent;

import cn.gloduck.api.entity.config.TorrentConfig;
import cn.gloduck.api.entity.model.torrent.TorrentHandlerInfo;
import cn.gloduck.api.entity.model.torrent.TorrentInfo;
import cn.gloduck.api.exceptions.ApiException;
import cn.gloduck.api.service.torrent.handler.BtsowHandler;
import cn.gloduck.api.service.torrent.handler.DmhyHandler;
import cn.gloduck.api.service.torrent.handler.TorrentHandler;
import cn.gloduck.api.utils.ConfigUtils;
import cn.gloduck.common.entity.base.ScrollPageResult;

import javax.swing.text.html.Option;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class TorrentService {
    private final Map<String, Boolean> handlerStatusMap;
    private final List<TorrentHandler> torrentHandlers;
    private final ScheduledExecutorService scheduledExecutor;

    public TorrentService(TorrentConfig config) {
        this.config = config;
        this.torrentHandlers = new ArrayList<>();
        this.scheduledExecutor = Executors.newSingleThreadScheduledExecutor();
        Optional.ofNullable(config.getBtsow()).ifPresent(btsow -> this.torrentHandlers.add(new BtsowHandler(btsow)));
        Optional.ofNullable(config.getDmhy()).ifPresent(dmhy -> this.torrentHandlers.add(new DmhyHandler(dmhy)));
        handlerStatusMap = new HashMap<>(torrentHandlers.size() / 3 * 4 + 1);
        scheduledExecutor.scheduleAtFixedRate(checkHandlerStatusTask(), 0, 30, TimeUnit.MINUTES);
    }

    private Runnable checkHandlerStatusTask() {
        return () -> {
            for (TorrentHandler torrentHandler : torrentHandlers) {
                boolean available = torrentHandler.checkAvailable();
                handlerStatusMap.put(torrentHandler.code(), available);
            }
        };
    }

    public List<TorrentHandlerInfo> listHandlers() {
        List<TorrentHandlerInfo> res = new ArrayList<>(torrentHandlers.size());
        for (TorrentHandler torrentHandler : torrentHandlers) {
            TorrentHandlerInfo info = new TorrentHandlerInfo();
            info.setCode(torrentHandler.code());
            info.setUrl(torrentHandler.url());
            info.setAvailable(handlerStatusMap.getOrDefault(torrentHandler.code(), false));
            info.setSupportSortFields(torrentHandler.sortFields());
            info.setTags(torrentHandler.tags());
            res.add(info);
        }
        return res;
    }

    public TorrentInfo queryDetail(String id, String code) {
        TorrentHandler torrentHandler = torrentHandlers.stream()
                .filter(t -> t.code().equals(code))
                .findFirst()
                .orElseThrow(() -> new ApiException("Unsupported source: " + code));
        return torrentHandler.queryDetail(id);
    }

    public ScrollPageResult<TorrentInfo> search(Integer pageIndex, Integer pageSize, String keyword, String code, String sortField, String sortOrder) {
        // 参数校验
        if (pageSize == null || pageIndex == null || keyword == null || code == null) {
            throw new ApiException("Invalid parameter");
        }

        // 获取对应的处理器
        TorrentHandler torrentHandler = torrentHandlers.stream()
                .filter(t -> t.code().equals(code))
                .findFirst()
                .orElseThrow(() -> new ApiException("Unsupported source: " + code));

        int handlerDefaultPageSize = torrentHandler.pageSize();
        List<TorrentInfo> combinedResults = new ArrayList<>();
        long startIndex = (long) (pageIndex - 1) * pageSize;
        int sourceStartPage = (int) (startIndex / handlerDefaultPageSize) + 1;
        int sourceOffset = (int) (startIndex % handlerDefaultPageSize);
        boolean lastHasNext;
        for (long i = sourceStartPage; ; i++) {
            long beforeSize = combinedResults.size();
            ScrollPageResult<TorrentInfo> searchResult = torrentHandler.search(keyword, i, sortField, sortOrder);
            List<TorrentInfo> items = searchResult.getItems();
            List<TorrentInfo> toAddResults;
            if (i == sourceStartPage) {
                // 跳过需要偏移的数据
                if (sourceOffset > items.size()) {
                    toAddResults = Collections.emptyList();
                } else {
                    toAddResults = items.subList(sourceOffset, items.size());
                }
            } else {
                toAddResults = items;
            }
            for (TorrentInfo toAddResult : toAddResults) {
                if (combinedResults.size() == pageSize) {
                    break;
                }
                combinedResults.add(toAddResult);
            }
            lastHasNext = searchResult.getHasNext() || ((combinedResults.size() - beforeSize) < toAddResults.size());
//            System.out.printf("获取源%s页的数据, 预添加该页数据量: %d, 实际添加数据量: %d%n", i, toAddResults.size(), combinedResults.size() - beforeSize);

            // 已经获取到足够的数据或没有更多数据了就退出
            if (combinedResults.size() == pageSize || !lastHasNext) {
                break;
            }
        }
        return new ScrollPageResult<>((long) pageIndex, lastHasNext, combinedResults);
    }

    private static TorrentService instance;

    private final TorrentConfig config;

    public static TorrentService instance() {
        if (instance == null) {
            TorrentConfig config = ConfigUtils.loadConfig("torrent", TorrentConfig.class);
            instance = new TorrentService(config);
        }
        return instance;
    }
}
