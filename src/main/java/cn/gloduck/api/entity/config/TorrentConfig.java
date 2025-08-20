package cn.gloduck.api.entity.config;

import lombok.Data;

@Data
public class TorrentConfig {
    private WebConfig btsow;

    private WebConfig dmhy;

    private WebConfig mikan;

    private WebConfig sukebeiNyaaSi;

    private WebConfig nyaaSi;

    @Data
    public static class WebConfig {
        private String url;

        private Integer validStatusTimeout;

        private Integer connectTimeout;

        private Integer requestTimeout;

        private String proxy;
    }
}
