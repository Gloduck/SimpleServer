package cn.gloduck.api.service.torrent.handler;

import cn.gloduck.api.entity.config.TorrentConfig;

import java.util.Arrays;
import java.util.List;

public class SukebeiNyaaSiHandler extends AbstractNyaaSiHandler {
    public SukebeiNyaaSiHandler(TorrentConfig.WebConfig config) {
        super(config);
    }

    @Override
    public String code() {
        return "sukebei.nyaa.si";
    }

    @Override
    public List<String> tags() {
        return Arrays.asList("ACG", "JAV");
    }
}
