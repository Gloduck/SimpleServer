package cn.gloduck.api.controller;

import cn.gloduck.api.service.index.IndexHtmlContst;
import cn.gloduck.common.entity.base.Result;
import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.handler.styles.classes.HtmlControllerHandler;
import cn.gloduck.server.core.handler.styles.classes.JsonControllerHandler;
import cn.gloduck.server.core.handler.styles.classes.XmlControllerHandler;

public class IndexController {

    public ControllerHandler index() {
        return new HtmlControllerHandler(HttpMethod.GET, "/", httpExchange -> IndexHtmlContst.INDEX_PAGE);
    }
}

