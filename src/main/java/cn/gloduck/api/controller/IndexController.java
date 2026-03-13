package cn.gloduck.api.controller;

import cn.gloduck.server.core.handler.special.StaticFileHandler;
import cn.gloduck.server.core.handler.ControllerHandler;

import java.util.Arrays;

public class IndexController {

    public ControllerHandler index() {
        return new StaticFileHandler("./", "static/index/index.html", Arrays.asList("/"));
    }

    public ControllerHandler commonJsHandler() {
        return new StaticFileHandler("./", "static/js/common.js", Arrays.asList("/static/js/common.js"));
    }

    public ControllerHandler favicon() {
        return new StaticFileHandler("./", "static/favicon.ico", Arrays.asList("/favicon.ico"));
    }
}
