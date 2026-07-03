package cn.gloduck.api.controller;

import cn.gloduck.api.entity.model.torrent.TorrentHandlerInfo;
import cn.gloduck.api.entity.model.torrent.TorrentInfo;
import cn.gloduck.api.service.torrent.TorrentService;
import cn.gloduck.common.entity.base.Result;
import cn.gloduck.common.entity.base.ScrollPageResult;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;

import java.util.List;

@Path("/api/torrent")
@Produces(MediaType.APPLICATION_JSON)
public class TorrentController {
    private final TorrentService torrentService;

    public TorrentController(TorrentService torrentService) {
        this.torrentService = torrentService;
    }

    @GET
    @Path("/listHandlers")
    public Result<List<TorrentHandlerInfo>> listHandlers() {
        return Result.success(torrentService.listHandlers());
    }

    @GET
    @Path("/queryDetail")
    public Result<TorrentInfo> queryDetail(@QueryParam("id") String id, @QueryParam("code") String code) {
        return Result.success(torrentService.queryDetail(id, code));
    }

    @GET
    @Path("/search")
    public Result<ScrollPageResult<TorrentInfo>> search(@QueryParam("keyword") String keyword,
                                                        @QueryParam("code") String code,
                                                        @QueryParam("pageIndex") Integer pageIndex,
                                                        @QueryParam("pageSize") Integer pageSize,
                                                        @QueryParam("sortField") String sortField,
                                                        @QueryParam("sortOrder") String sortOrder) {
        return Result.success(torrentService.search(pageIndex, pageSize, keyword, code, sortField, sortOrder));
    }
}
