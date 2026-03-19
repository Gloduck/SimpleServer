package cn.gloduck.api.service.github;

import cn.gloduck.api.entity.config.GithubConfig;
import cn.gloduck.api.utils.ConfigUtils;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

public class GithubService {
    private final GithubConfig config;

    private GithubService(GithubConfig config) {
        this.config = config;
    }

    public List<String> getHotSearches() {
        return Optional.ofNullable(config.hotSearches).orElse(Collections.emptyList());
    }

    private static GithubService instance;

    public static GithubService instance() {
        if (instance == null) {
            GithubConfig config = ConfigUtils.loadConfig("github", GithubConfig.class);
            instance = new GithubService(config);
        }
        return instance;
    }
}
