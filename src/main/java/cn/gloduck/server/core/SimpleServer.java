package cn.gloduck.server.core;

import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.handler.RouterHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.lang.reflect.Method;
import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.logging.Logger;

public class SimpleServer {
    private final static Logger LOGGER = Logger.getLogger(SimpleServer.class.getName());
    private final HttpServer server;
    private final List<ControllerHandler> handlers = new ArrayList<>();

    public SimpleServer(int port, int workThreads) throws IOException {
        server = HttpServer.create(new InetSocketAddress(port), 0);
        server.setExecutor(Executors.newFixedThreadPool(workThreads));
        server.createContext("/", new RouterHandler(handlers));
    }

    public void addHandler(ControllerHandler handler) {
        LOGGER.info(String.format("Register handler [%s] %s", handler.getHttpMethod(), handler.getRequestPath()));
        handlers.add(handler);
    }

    public void registerController(Object controller) {
        Method[] methods = controller.getClass().getMethods();
        for (Method method : methods) {
            if (!ControllerHandler.class.isAssignableFrom(method.getReturnType())) {
                continue;
            }
            try {
                ControllerHandler handler = (ControllerHandler) method.invoke(controller);
                addHandler(handler);
            } catch (ReflectiveOperationException e) {
                LOGGER.warning("Failed to register controller " + controller.getClass().getName() + " method " + method.getName() + " : " + e.getMessage());
            }
        }
    }

    public void start() {
        server.start();
        LOGGER.info("Server started on port " + server.getAddress().getPort());
    }

}
