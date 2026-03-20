package cn.gloduck.api;

import cn.gloduck.api.controller.*;
import cn.gloduck.api.entity.config.ServerConfig;
import cn.gloduck.api.log.SpringBootStyleFormatter;
import cn.gloduck.api.log.TemplateFileHandler;
import cn.gloduck.server.core.SimpleServer;
import cn.gloduck.server.core.handler.special.StaticFileHandler;

import java.io.IOException;
import java.util.Arrays;
import java.util.Optional;
import java.util.logging.Formatter;
import java.util.logging.Level;
import java.util.logging.LogManager;
import java.util.logging.Logger;

public class Bootstrap {
    public static void main(String[] args) throws IOException {
        ApplicationContext.init();
        ServerConfig config = ApplicationContext.getGlobalConfig();
        configureLogging(config);
        Integer workThreads = Optional.ofNullable(config.workThreads).orElse(5);
        SimpleServer server = new SimpleServer(config.port, workThreads);
        server.registerController(new IndexController());
        server.registerController(new JrebelController());
        server.registerController(new OnlineClipBoardController());
        server.registerController(new TorrentController());
        server.registerController(new GithubController());
        server.registerController(new ForwardController());
        server.addHandler(new StaticFileHandler("./static", Arrays.asList("/static/**")).disableClasspath());
        server.start();
    }

    private static void configureLogging(ServerConfig config) throws IOException {
        Level logLevel = Level.parse(config.logLevel);
        Logger rootLogger = LogManager.getLogManager().getLogger("");
        rootLogger.setLevel(logLevel);

        Formatter consoleFormatter = new SpringBootStyleFormatter();
        Arrays.stream(rootLogger.getHandlers()).forEach(handler -> {
            handler.setFormatter(consoleFormatter);
            handler.setLevel(logLevel);
        });

        String logFilePattern = Optional.ofNullable(config.logFile)
                .filter(s -> !s.isBlank())
                .orElse(null);
        if (logFilePattern == null) {
            return;
        }

        TemplateFileHandler fileHandler = new TemplateFileHandler(logFilePattern);
        fileHandler.setEncoding("UTF-8");
        fileHandler.setFormatter(new SpringBootStyleFormatter(false));
        fileHandler.setLevel(logLevel);
        rootLogger.addHandler(fileHandler);
    }
}
