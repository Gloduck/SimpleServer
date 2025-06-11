package cn.gloduck.api.controller;

import cn.gloduck.api.entity.model.jrebel.JrebelLeasesV1Model;
import cn.gloduck.api.service.jrebel.JRebelService;
import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.handler.styles.classes.HtmlControllerHandler;
import cn.gloduck.server.core.handler.styles.classes.JsonControllerHandler;
import cn.gloduck.server.core.util.HttpExchangeUtils;
import com.sun.net.httpserver.HttpExchange;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;

public class JrebelController {
    private JRebelService jRebelService = JRebelService.instance();

    public ControllerHandler htmlHandler() {
        return new HtmlControllerHandler(HttpMethod.GET, "/jrebel", exchange -> {
            String content = """
                    <!DOCTYPE html>
                    <html lang="zh">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1">
                        <title>JRebel激活</title>
                        <style>
                            body {
                                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                                display: flex;
                                flex-direction: column;
                                align-items: center;
                                min-height: 100vh;
                                margin: 2rem;
                                background: #f5f5f7;
                            }
                            .container {
                                text-align: center;
                                max-width: 600px;
                            }
                            h1 {
                                color: #1d1d1f;
                                margin-bottom: 1.5rem;
                            }
                            a {
                                color: #0071e3;
                                text-decoration: none;
                                font-size: 1.2rem;
                                word-break: break-all;
                            }
                            .alert {
                                background: #fff3d4;
                                color: #5c3b05;
                                padding: 1rem;
                                border-radius: 8px;
                                border: 1px solid #ffd699;
                                margin-top: 2rem;
                                width: 100%;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1>激活路径</h1>
                            <a href="${activeAddress}">${activeAddress}</a>
                            <div class="alert">
                                ⚠️ 如果出现：Cannot read the array length because "sigBytes" is null，点击离线然后再次在线就可以正常激活了
                            </div>
                        </div>
                    </body>
                    </html>
                    """;
            String address = HttpExchangeUtils.getBaseUrl(exchange) + "/jrebel/" + UUID.randomUUID().toString();
            content = content.replace("${activeAddress}", address);
            return content;
        });
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
