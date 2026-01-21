package cn.gloduck.api.controller;

import cn.gloduck.server.core.handler.special.ClassPathFileHandler;
import cn.gloduck.server.core.handler.special.StaticFileHandler;
import cn.gloduck.server.core.handler.ControllerHandler;

public class IndexController {

    public ControllerHandler index() {
        return new ClassPathFileHandler("/", "static/index/index.html");
    }

    public ControllerHandler commonJsHandler(){
        return new ClassPathFileHandler("/static/js/common.js", "static/js/common.js");
    }

    public ControllerHandler favicon() {
        return new ClassPathFileHandler("/favicon.ico", "static/favicon.ico");
    }
}

