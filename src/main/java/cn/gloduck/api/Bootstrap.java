package cn.gloduck.api;

import cn.gloduck.api.controller.HelloController;
import cn.gloduck.api.controller.JrebelController;
import cn.gloduck.api.entity.config.ServerConfig;
import cn.gloduck.api.utils.ConfigUtils;
import cn.gloduck.server.core.SimpleServer;
import cn.gloduck.server.core.handler.StaticFileHandler;

import java.io.IOException;

public class Bootstrap {
    public static void main(String[] args) throws IOException {
        ServerConfig config = ConfigUtils.loadConfig(null, ServerConfig.class);
        SimpleServer server = new SimpleServer(config.port);
        server.registerController(new HelloController());
        server.registerController(new JrebelController());
        server.addHandler(new StaticFileHandler("./", "/static/**"));
        server.start();
    }

}
