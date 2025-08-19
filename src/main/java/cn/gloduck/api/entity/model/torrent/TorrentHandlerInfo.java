package cn.gloduck.api.entity.model.torrent;

import lombok.Data;

import java.util.List;

@Data
public class TorrentHandlerInfo {
    private String code;

    private String url;

    private Boolean available;

    private List<String> supportSortFields;
}
