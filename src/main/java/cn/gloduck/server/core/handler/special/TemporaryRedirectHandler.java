package cn.gloduck.server.core.handler.special;

import java.util.List;

public class TemporaryRedirectHandler extends RedirectHandler {
    public TemporaryRedirectHandler(String matchPath, String redirectPath) {
        super(matchPath, redirectPath);
    }

    public TemporaryRedirectHandler(List<String> matchPaths, String redirectPath) {
        super(matchPaths, redirectPath);
    }

    @Override
    public int getRedirectCode() {
        return 302;
    }
}
