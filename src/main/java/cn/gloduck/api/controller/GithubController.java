package cn.gloduck.api.controller;

import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.handler.special.ClassPathFileHandler;

import java.util.Arrays;

public class GithubController {
    public ControllerHandler index() {
        return new ClassPathFileHandler(Arrays.asList("/github", "/github/"), "static/github/index.html");
    }
}
