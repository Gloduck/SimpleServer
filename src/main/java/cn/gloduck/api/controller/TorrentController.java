package cn.gloduck.api.controller;

import cn.gloduck.api.service.torrent.TorrentService;
import cn.gloduck.common.entity.base.Result;
import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ClassPathFileHandler;
import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.handler.styles.classes.JsonControllerHandler;
import cn.gloduck.server.core.util.HttpExchangeUtils;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

public class TorrentController {
    private TorrentService torrentService = TorrentService.instance();

    public ControllerHandler listHandlers() {
        return new JsonControllerHandler<>(HttpMethod.GET, "/torrent/listHandlers", t -> Result.success(torrentService.listHandlers()));
    }

    public ControllerHandler queryDetail() {
        return new JsonControllerHandler<>(HttpMethod.GET, "/torrent/queryDetail", t -> {
            Map<String, List<String>> parameters = HttpExchangeUtils.getAllRequestParameters(t);
            String id = HttpExchangeUtils.getStringParameter(parameters, "id");
            String code = HttpExchangeUtils.getStringParameter(parameters, "code");
            return Result.success(torrentService.queryDetail(id, code));
        });
    }

    public ControllerHandler search() {
        return new JsonControllerHandler<>(HttpMethod.GET, "/torrent/search", t -> {
            Map<String, List<String>> parameters = HttpExchangeUtils.getAllRequestParameters(t);
            String keyword = HttpExchangeUtils.getStringParameter(parameters, "keyword");
            String code = HttpExchangeUtils.getStringParameter(parameters, "code");
            Integer pageIndex = HttpExchangeUtils.getIntegerParameter(parameters, "pageIndex");
            Integer pageSize = HttpExchangeUtils.getIntegerParameter(parameters, "pageSize");
            String sortField = HttpExchangeUtils.getStringParameter(parameters, "sortField");
            String sortOrder = HttpExchangeUtils.getStringParameter(parameters, "sortOrder");
            return Result.success(torrentService.search(pageIndex, pageSize, keyword, code, sortField, sortOrder));
        });
    }

    public ControllerHandler index() {
        return new ClassPathFileHandler(Arrays.asList("/torrent", "/torrent/"), "static/torrent/index.html");
    }

}
