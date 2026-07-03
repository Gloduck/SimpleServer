package cn.gloduck.api.controller;

import io.vertx.ext.web.Router;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;

@ApplicationScoped
public class SpaFallbackRoute {
    private static final String SPA_ROUTES = "/(?:jrebel|torrent|github|imageEditor|forward|clipboard|mdeditor|codeEditor)(?:/.*)?";

    void register(@Observes Router router) {
        router.getWithRegex(SPA_ROUTES).handler(context -> context.reroute("/index.html"));
    }
}
