package cn.gloduck.api.controller;

import cn.gloduck.api.entity.config.ForwardConfig;
import cn.gloduck.api.utils.ConfigUtils;
import cn.gloduck.api.utils.NetUtils;
import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.handler.special.ForwardHandler;

import java.net.InetSocketAddress;
import java.net.Proxy;

public class ForwardController {
    public ControllerHandler forwardHandler() {
        ForwardConfig forwardConfig = ConfigUtils.loadConfig("forward", ForwardConfig.class);
        ForwardHandler handler = new ForwardHandler("/api/forward/proxy", "url");
        InetSocketAddress proxyAddress = NetUtils.buildProxyAddress(forwardConfig.proxy);
        if (proxyAddress != null) {
            handler.setProxy(new Proxy(Proxy.Type.HTTP, proxyAddress));
        }
        return handler;
    }

}
