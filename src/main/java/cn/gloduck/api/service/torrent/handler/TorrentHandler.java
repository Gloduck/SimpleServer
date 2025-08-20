package cn.gloduck.api.service.torrent.handler;

import cn.gloduck.api.entity.model.torrent.TorrentInfo;
import cn.gloduck.common.entity.base.ScrollPageResult;

import java.util.List;

public interface TorrentHandler {
    TorrentInfo queryDetail(String id);

    ScrollPageResult<TorrentInfo> search(String keyword, Long index, String sortField, String sortOrder);

    String url();

    List<String> sortFields();

    String code();

    List<String> tags();

    boolean checkAvailable();

    int pageSize();
}
