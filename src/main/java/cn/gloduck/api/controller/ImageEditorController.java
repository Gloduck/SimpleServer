package cn.gloduck.api.controller;

import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.handler.special.StaticFileHandler;

import java.util.Arrays;

public class ImageEditorController {
    public ControllerHandler index() {
        return new StaticFileHandler("./", "static/imageEditor/index.html", Arrays.asList("/imageEditor", "/imageEditor/"));
    }
}
