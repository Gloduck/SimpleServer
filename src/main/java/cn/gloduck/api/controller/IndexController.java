package cn.gloduck.api.controller;

import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ClassPathFileHandler;
import cn.gloduck.server.core.handler.ControllerHandler;

public class IndexController {

    public ControllerHandler index() {
        return new ClassPathFileHandler(HttpMethod.GET, "/", "static/index/index.html");
    }
}

