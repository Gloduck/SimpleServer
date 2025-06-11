package cn.gloduck.api.controller;

import cn.gloduck.common.entity.base.Result;
import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.handler.styles.classes.JsonControllerHandler;
import cn.gloduck.server.core.handler.styles.classes.XmlControllerHandler;

public class HelloController {
    public ControllerHandler json() {
        return new JsonControllerHandler<>(HttpMethod.GET, "/hello/json", httpExchange -> Result.success());
    }

    public ControllerHandler xml() {
        return new XmlControllerHandler<>(HttpMethod.GET, "/hello/xml", httpExchange -> Result.success());
    }

    ;
}
