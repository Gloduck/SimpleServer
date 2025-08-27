package cn.gloduck.server.core.handler.styles.classes;

import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ApiEndpoint;
import cn.gloduck.server.core.util.XmlUtils;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.util.List;
import java.util.function.Function;

public class XmlControllerHandler<R> extends AbstractControllerHandler<R> {
    public XmlControllerHandler(HttpMethod method, String requestPath, Function<HttpExchange, R> handler) {
        super(method, requestPath, handler);
    }

    public XmlControllerHandler(HttpMethod method, List<String> requestPaths, Function<HttpExchange, R> handler) {
        super(method, requestPaths, handler);
    }

    @Override
    protected byte[] convertResult(R result) throws IOException {
        return XmlUtils.writeValueAsBytes(result);
    }

    @Override
    public String getContentType(HttpExchange exchange) {
        return "application/xml;charset=utf-8";
    }
}
