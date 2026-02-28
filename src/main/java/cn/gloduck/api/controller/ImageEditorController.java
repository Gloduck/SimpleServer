package cn.gloduck.api.controller;

import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.handler.special.ClassPathFileHandler;

import java.util.Arrays;

public class ImageEditorController {
    public ControllerHandler index() {
        return new ClassPathFileHandler(Arrays.asList("/imageEditor", "/imageEditor/"), "static/imageEditor/index.html");
    }
}