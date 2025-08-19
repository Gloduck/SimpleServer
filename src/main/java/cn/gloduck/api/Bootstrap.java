package cn.gloduck.api;

import cn.gloduck.api.controller.IndexController;
import cn.gloduck.api.controller.JrebelController;
import cn.gloduck.api.controller.OnlineClipBoardController;
import cn.gloduck.api.controller.TorrentController;
import cn.gloduck.api.entity.config.ServerConfig;
import cn.gloduck.api.log.SpringBootStyleFormatter;
import cn.gloduck.api.utils.ConfigUtils;
import cn.gloduck.server.core.SimpleServer;
import cn.gloduck.server.core.handler.StaticFileHandler;

import java.io.IOException;
import java.util.Arrays;
import java.util.logging.*;

public class Bootstrap {
    public static void main(String[] args) throws IOException {
        ServerConfig config = ConfigUtils.loadConfig(null, ServerConfig.class);
        setLoggerLevel(config.logLevel);
        SimpleServer server = new SimpleServer(config.port);
        server.registerController(new IndexController());
        server.registerController(new JrebelController());
        server.registerController(new OnlineClipBoardController());
        server.registerController(new TorrentController());
        server.addHandler(new StaticFileHandler("./", "/static/**"));
        server.start();
    }

    private static void setLoggerLevel(String level){
        Level logLevel = Level.parse(level);
        Formatter formatter = new SpringBootStyleFormatter();
        Arrays.stream(LogManager.getLogManager().getLogger("").getHandlers()).forEach(h -> {
            h.setFormatter(formatter);
            h.setLevel(logLevel);
        });
    }
}
