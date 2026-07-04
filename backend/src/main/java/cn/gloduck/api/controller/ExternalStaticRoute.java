package cn.gloduck.api.controller;

import cn.gloduck.api.utils.FileUtils;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.handler.StaticHandler;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;

import java.nio.file.Path;

@ApplicationScoped
public class ExternalStaticRoute {
    private static final String STATIC_ROUTE = "/static/*";
    private static final String STATIC_DIR_NAME = "static";

    void register(@Observes Router router) {
        Path staticDir = FileUtils.applicationDirectory(ExternalStaticRoute.class)
                .resolve(STATIC_DIR_NAME)
                .toAbsolutePath()
                .normalize();

        StaticHandler handler = StaticHandler.create(staticDir.toString())
                .setAllowRootFileSystemAccess(true)
                .setDirectoryListing(false);

        router.get(STATIC_ROUTE).handler(handler);
        router.head(STATIC_ROUTE).handler(handler);
    }
}
