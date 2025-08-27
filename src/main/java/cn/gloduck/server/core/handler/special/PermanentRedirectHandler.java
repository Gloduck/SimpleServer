package cn.gloduck.server.core.handler.special;

import java.util.List;

public class PermanentRedirectHandler extends RedirectHandler {
    public PermanentRedirectHandler(String matchPath, String redirectPath) {
        super(matchPath, redirectPath);
    }

    public PermanentRedirectHandler(List<String> matchPaths, String redirectPath) {
        super(matchPaths, redirectPath);
    }

    @Override
    public int getRedirectCode() {
        return 301;
    }
}
