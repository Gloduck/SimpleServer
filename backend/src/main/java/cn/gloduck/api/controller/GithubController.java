package cn.gloduck.api.controller;

import cn.gloduck.api.service.github.GithubService;
import cn.gloduck.common.entity.base.Result;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import java.util.List;

@Path("/api/github")
@Produces(MediaType.APPLICATION_JSON)
public class GithubController {
    private final GithubService githubService;

    public GithubController(GithubService githubService) {
        this.githubService = githubService;
    }

    @GET
    @Path("/hotSearches")
    public Result<List<String>> hotSearches() {
        return Result.success(githubService.getHotSearches());
    }
}
