package cn.gloduck.api.controller;

import cn.gloduck.api.service.github.GithubService;
import cn.gloduck.common.entity.base.Result;
import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.handler.styles.classes.JsonControllerHandler;

public class GithubController {
    private final GithubService githubService = GithubService.instance();

    public ControllerHandler hotSearches() {
        return new JsonControllerHandler<>(HttpMethod.GET, "/api/github/hotSearches", t -> {
            return Result.success(githubService.getHotSearches());
        });
    }

}
