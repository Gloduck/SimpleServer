package cn.gloduck.server.core.handler;

public class TemporaryRedirectHandler extends RedirectHandler {
    public TemporaryRedirectHandler(String matchPath, String redirectPath) {
        super(matchPath, redirectPath);
    }

    @Override
    public int getRedirectCode() {
        return 302;
    }
}
