package cn.gloduck.api.entity.model.torrent;

import lombok.Data;

import java.util.List;

@Data
public class TorrentHandlerInfo {
    private String code;

    private String url;

    private Boolean available;

    private List<String> tags;

    /**
     * 支持的排序字段
     * 格式: "+field" = 只支持升序, "-field" = 只支持降序, "field" = 支持两种排序
     * 返回空列表表示不支持排序
     */
    private List<String> supportSortFields;
}
