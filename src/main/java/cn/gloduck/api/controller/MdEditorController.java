package cn.gloduck.api.controller;

import cn.gloduck.server.core.handler.special.ClassPathFileHandler;
import cn.gloduck.server.core.handler.ControllerHandler;

public class MdEditorController {

    public ControllerHandler index() {
        return new ClassPathFileHandler("/mdeditor", "static/mdeditor/index.html");
    }
}
