package cn.gloduck.server.core.handler;

public class PermanentRedirectHandler extends RedirectHandler {
    public PermanentRedirectHandler(String matchPath, String redirectPath) {
        super(matchPath, redirectPath);
    }

    @Override
    public int getRedirectCode() {
        return 301;
    }
}
