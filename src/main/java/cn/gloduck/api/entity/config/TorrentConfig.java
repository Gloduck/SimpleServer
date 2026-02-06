package cn.gloduck.api.entity.config;

public class TorrentConfig {
    public String proxy;

    public String bypassCfApi;

    public WebConfig btsow;

    public WebConfig dmhy;

    public WebConfig mikan;

    public WebConfig sukebeiNyaaSi;

    public WebConfig nyaaSi;

    public WebConfig tokyoToshokan;

    public WebConfig torrentkitty;

    public WebConfig anybt;

    public static class WebConfig {
        public String url;

        public Integer validStatusTimeout;

        public Integer requestTimeout;

        public Boolean useProxy;

        public Boolean bypassCf;

        public Boolean trustAllCertificates;
    }
}
