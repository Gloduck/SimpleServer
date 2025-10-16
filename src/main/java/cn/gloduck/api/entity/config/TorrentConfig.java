package cn.gloduck.api.entity.config;

public class TorrentConfig {
    public WebConfig btsow;

    public WebConfig dmhy;

    public WebConfig mikan;

    public WebConfig sukebeiNyaaSi;

    public WebConfig nyaaSi;

    public WebConfig tokyoToshokan;

    public static class WebConfig {
        public String url;

        public Integer validStatusTimeout;

        public Integer connectTimeout;

        public Integer requestTimeout;

        public String proxy;

        public Boolean trustAllCertificates;
    }
}
