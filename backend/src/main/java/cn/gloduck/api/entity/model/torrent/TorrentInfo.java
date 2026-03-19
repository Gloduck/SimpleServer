package cn.gloduck.api.entity.model.torrent;

import lombok.Data;

import java.util.Date;
import java.util.List;

@Data
public class TorrentInfo {
    private String id;

    private String name;

    private String hash;

    private Long size;

    private Date uploadTime;

    /**
     * 详情属性
     */
    private Long fileCount;

    /**
     * 详情属性
     */
    private List<TorrentFileInfo> files;
}
