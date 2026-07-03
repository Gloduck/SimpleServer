package cn.gloduck.api.service.github;

import cn.gloduck.api.entity.config.GithubConfig;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

@ApplicationScoped
public class GithubService {
    private final GithubConfig config;

    public GithubService(GithubConfig config) {
        this.config = config;
    }

    public List<String> getHotSearches() {
        return Optional.ofNullable(config.hotSearches).orElse(Collections.emptyList());
    }
}
