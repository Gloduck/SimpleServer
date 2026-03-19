package cn.gloduck.api.controller;

import cn.gloduck.server.core.handler.special.StaticFileHandler;
import cn.gloduck.server.core.handler.ControllerHandler;

import java.util.Arrays;

public class IndexController {
    public ControllerHandler index() {
        return new StaticFileHandler("./front", "index.html", Arrays.asList("/"));
    }

    public ControllerHandler assets() {
        return new StaticFileHandler("./front", Arrays.asList("/assets/**"));
    }

    public ControllerHandler favicon() {
        return new StaticFileHandler("./front", "favicon.ico", Arrays.asList("/favicon.ico"));
    }

    public ControllerHandler spaRoutes() {
        return new StaticFileHandler("./front", "index.html", Arrays.asList(
                "/jrebel",
                "/torrent",
                "/github",
                "/imageEditor",
                "/forward",
                "/clipboard",
                "/clipboard/*",
                "/mdeditor"
        ));
    }
}
