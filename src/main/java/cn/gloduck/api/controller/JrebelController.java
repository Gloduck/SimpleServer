package cn.gloduck.api.controller;

import cn.gloduck.api.entity.model.jrebel.JrebelLeasesV1Model;
import cn.gloduck.api.service.jrebel.JRebelService;
import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ClassPathFileHandler;
import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.handler.styles.classes.JsonControllerHandler;
import cn.gloduck.server.core.util.HttpExchangeUtils;
import com.sun.net.httpserver.HttpExchange;

import java.util.List;
import java.util.Map;
import java.util.function.Function;

public class JrebelController {
    private JRebelService jRebelService = JRebelService.instance();

    public ControllerHandler htmlHandler() {
        return new ClassPathFileHandler("/jrebel", "static/jrebel/index.html");
    }

    public ControllerHandler leasesHandler() {
        return new JsonControllerHandler<>(HttpMethod.POST, "/jrebel/jrebel/leases", exchange -> {
            Map<String, List<String>> parameters = HttpExchangeUtils.getAllRequestParameters(exchange);
            String username = HttpExchangeUtils.getStringParameter(parameters, "username");
            String clientGuid = HttpExchangeUtils.getStringParameter(parameters, "guid");
            String clientRandomness = HttpExchangeUtils.getStringParameter(parameters, "randomness");
            Long clientTime = HttpExchangeUtils.getLongParameter(parameters, "clientTime");
            Boolean offline = HttpExchangeUtils.getBooleanParameter(parameters, "offline");
            Integer offlineDays = HttpExchangeUtils.getIntegerParameter(parameters, "offlineDays");
            return jRebelService.jrebelLeases(username, clientRandomness, clientTime, clientGuid, offline, offlineDays);
        });
    }

    public ControllerHandler leases1PostHandler() {
        return new JsonControllerHandler<>(HttpMethod.POST, "/jrebel/jrebel/leases/1", leases1Handler());
    }

    public ControllerHandler leases1DeleteHandler() {
        return new JsonControllerHandler<>(HttpMethod.DELETE, "/jrebel/jrebel/leases/1", leases1Handler());
    }

    private Function<HttpExchange, JrebelLeasesV1Model> leases1Handler() {
        return exchange -> {
            Map<String, List<String>> parameters = HttpExchangeUtils.getAllRequestParameters(exchange);
            String username = HttpExchangeUtils.getStringParameter(parameters, "username");
            return jRebelService.jrebelLeases1(username);
        };
    }
}
