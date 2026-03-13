package cn.gloduck.api.controller;

import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.handler.special.StaticFileHandler;

import java.util.Arrays;

public class MdEditorController {

    public ControllerHandler index() {
        return new StaticFileHandler("./", "static/mdeditor/index.html", Arrays.asList("/mdeditor"));
    }
}
