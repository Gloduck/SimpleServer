package cn.gloduck.server.core.handler.styles.interfaces;

import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.util.XmlUtils;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;

public interface XmlControllerHandler extends ControllerHandler {
    @Override
    default String getContentType(HttpExchange exchange) {
        return "application/xml;charset=utf-8";
    }

    @Override
    default byte[] handleRequest(HttpExchange exchange) throws IOException {
        Object response = handleXmlRequest(exchange);
        return XmlUtils.writeValueAsBytes(response);
    }

    Object handleXmlRequest(HttpExchange exchange) throws IOException;

}
