package cn.gloduck.server.core.handler;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import cn.gloduck.server.core.util.HttpExchangeUtils;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Objects;
import java.util.logging.Level;
import java.util.logging.Logger;

public class RouterHandler implements HttpHandler {
    private final static Logger LOGGER = Logger.getLogger(RouterHandler.class.getName());
    private final List<ControllerHandler> handlers;

    public RouterHandler(List<ControllerHandler> handlers) {
        this.handlers = handlers;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        logRequest(exchange);
        try {
            String requestPath = exchange.getRequestURI().getPath();
            String requestMethod = exchange.getRequestMethod();

            for (ControllerHandler handler : handlers) {
                List<ApiEndpoint> apiEndpoints = handler.getApiEndpoints();
                boolean matchHandler = apiEndpoints.stream().anyMatch(apiEndpoint -> isPathMatch(apiEndpoint.getPath(), requestPath) &&
                        apiEndpoint.getMethod().name().equals(requestMethod));
                if (!matchHandler) {
                    continue;
                }
                handler.handleRequest(exchange);
                return;
            }
            sendError(exchange, 404, "Not Found");
        } catch (FileNotFoundException e) {
            sendError(exchange, 404, "Resource Not Found");
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Internal Server Error", e);
            sendError(exchange, 500, "Internal Server Error");
        } finally {
            exchange.close();
        }
    }

    private boolean isPathMatch(String pattern, String actualPath) {
        if (pattern.endsWith("/*")) {
            String prefix = pattern.substring(0, pattern.length() - 2) + "/";
            if (!actualPath.startsWith(prefix)) {
                return false;
            }
            return !actualPath.substring(prefix.length()).contains("/");
        } else if (pattern.endsWith("/**")) {
            String prefix = pattern.substring(0, pattern.length() - 3);
            return actualPath.startsWith(prefix);
        }
        return Objects.equals(pattern, actualPath);
    }



    private void sendError(HttpExchange exchange, int code, String message) throws IOException {
        byte[] bytes = message.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(code, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
        logError(exchange, code, message);
    }

    private void logError(HttpExchange exchange, int code, String message) {
        String clientIp = HttpExchangeUtils.getClientIp(exchange);
        if(clientIp == null){
            clientIp = "unknown";
        }

        LOGGER.warning(String.format("Request [%s] %s exist with code [%s] and message [%s], clientIp: [%s]", exchange.getRequestMethod(), exchange.getRequestURI(), code, message, clientIp));
    }

    private void logRequest(HttpExchange exchange) {
        LOGGER.info(String.format("Request [%s] %s", exchange.getRequestMethod(), exchange.getRequestURI()));
    }
}
