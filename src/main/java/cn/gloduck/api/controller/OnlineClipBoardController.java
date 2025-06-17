package cn.gloduck.api.controller;

import cn.gloduck.api.entity.db.OnlineClipBoard;
import cn.gloduck.api.service.clipboard.OnlineClipBoardHtmlConst;
import cn.gloduck.api.service.clipboard.OnlineClipBoardService;
import cn.gloduck.common.entity.base.Result;
import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.handler.styles.classes.HtmlControllerHandler;
import cn.gloduck.server.core.handler.styles.classes.JsonControllerHandler;
import cn.gloduck.server.core.util.HttpExchangeUtils;
import cn.gloduck.server.core.util.JsonUtils;

import java.util.List;
import java.util.Map;

public class OnlineClipBoardController {
    private OnlineClipBoardService service = OnlineClipBoardService.instance();

    public ControllerHandler getById() {
        return new JsonControllerHandler<>(HttpMethod.GET, "/clipboard/v1/query", exchange -> {
            Map<String, List<String>> parameters = HttpExchangeUtils.getAllRequestParameters(exchange);
            String id = HttpExchangeUtils.getStringParameter(parameters, "id");
            return Result.success(service.getById(id));
        });
    }

    public ControllerHandler save() {
        return new JsonControllerHandler<>(HttpMethod.POST, "/clipboard/v1/save", exchange -> {
            OnlineClipBoard onlineClipBoard = JsonUtils.readValue(exchange.getRequestBody(), OnlineClipBoard.class);
            boolean success = service.save(onlineClipBoard);
            return success ? Result.success() : Result.failed();
        });
    }

    public ControllerHandler delete() {
        return new JsonControllerHandler<>(HttpMethod.DELETE, "/clipboard/v1/delete", exchange -> {
            Map<String, List<String>> parameters = HttpExchangeUtils.getAllRequestParameters(exchange);
            String id = HttpExchangeUtils.getStringParameter(parameters, "id");
            boolean success = service.delete(id);
            return success ? Result.success() : Result.failed();
        });
    }

    public ControllerHandler index2() {
        return new HtmlControllerHandler(HttpMethod.GET, "/clipboard/", exchange -> {
            return OnlineClipBoardHtmlConst.INDEX_PAGE;
        });
    }

    public ControllerHandler index1() {
        return new HtmlControllerHandler(HttpMethod.GET, "/clipboard", exchange -> {
            return OnlineClipBoardHtmlConst.INDEX_PAGE;
        });
    }

    public ControllerHandler clipboard() {
        return new HtmlControllerHandler(HttpMethod.GET, "/clipboard/*", exchange -> {
            return OnlineClipBoardHtmlConst.CLIPBOARD_PAGE;
        });
    }
}
