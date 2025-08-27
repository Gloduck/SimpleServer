package cn.gloduck.server.core.handler;


import cn.gloduck.server.core.enums.HttpMethod;

public class ApiEndpoint {
    private HttpMethod method;

    private String path;

    public HttpMethod getMethod() {
        return method;
    }

    public String getPath() {
        return path;
    }

    public ApiEndpoint(HttpMethod method, String path) {
        this.method = method;
        this.path = path;
    }
}
