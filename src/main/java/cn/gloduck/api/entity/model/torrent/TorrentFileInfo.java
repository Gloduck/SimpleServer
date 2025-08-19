package cn.gloduck.api.entity.model.torrent;

import lombok.Data;

@Data
public class TorrentFileInfo {
    private String name;

    private Long size;
}
