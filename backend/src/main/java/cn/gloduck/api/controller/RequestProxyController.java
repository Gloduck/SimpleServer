package cn.gloduck.api.controller;

import cn.gloduck.api.ApplicationContext;
import cn.gloduck.api.entity.config.ProxyRequestConfig;
import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.handler.special.RequestProxyHandler;

public class RequestProxyController {
    public ControllerHandler requestProxyHandler() {
        ProxyRequestConfig proxyRequestConfig = ApplicationContext.getConfig(ProxyRequestConfig.class);
        return new RequestProxyHandler("/api/requestProxy", proxyRequestConfig.proxy);
    }
}
