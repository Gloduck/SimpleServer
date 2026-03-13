package cn.gloduck.server.core.handler.special;

import cn.gloduck.server.core.enums.HttpMethod;
import cn.gloduck.server.core.handler.ApiEndpoint;
import cn.gloduck.server.core.handler.ControllerHandler;
import cn.gloduck.server.core.util.FileUtils;
import com.sun.net.httpserver.HttpExchange;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.net.URLConnection;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public class StaticFileHandler implements ControllerHandler {
    private final List<ApiEndpoint> apiEndpoints;
    private final Path runtimeDirectory;
    private final String fixedResourcePath;
    private boolean runtimeDirectoryEnabled = true;
    private boolean classpathEnabled = true;


    public StaticFileHandler(String runtimeDirectory, List<String> patterns) {
        this(runtimeDirectory, null, patterns);
    }

    public StaticFileHandler(String runtimeDirectory, String fixedResourcePath, List<String> pathPatterns) {
        this.runtimeDirectory = Paths.get(Objects.requireNonNull(runtimeDirectory, "runtimeDirectory must not be null"))
                .toAbsolutePath()
                .normalize();
        for (String pathPattern : pathPatterns) {
            Objects.requireNonNull(pathPattern, "pathPattern must not be null");
        }
        this.apiEndpoints = buildApiEndpoints(pathPatterns);
        this.fixedResourcePath = fixedResourcePath != null ? normalizeRelativePath(fixedResourcePath) : null;
    }

    public StaticFileHandler disableRuntimeDirectory() {
        runtimeDirectoryEnabled = false;
        return this;
    }

    public StaticFileHandler disableClasspath() {
        classpathEnabled = false;
        return this;
    }

    @Override
    public List<ApiEndpoint> getApiEndpoints() {
        return apiEndpoints;
    }

    @Override
    public void handleRequest(HttpExchange exchange) throws IOException {
        try (InputStream in = getFileInputStream(exchange)) {
            if (in == null) {
                throw new FileNotFoundException("Resource not found");
            }

            String contentType = getContentType(exchange);
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.sendResponseHeaders(200, getContentLength(exchange));

            if (HttpMethod.HEAD.name().equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.getResponseBody().close();
                return;
            }

            byte[] buffer = new byte[8192];
            int bytesRead;
            try (var output = exchange.getResponseBody()) {
                while ((bytesRead = in.read(buffer)) != -1) {
                    output.write(buffer, 0, bytesRead);
                }
            }
        }
    }

    private InputStream getFileInputStream(HttpExchange exchange) throws IOException {
        return getResolveResource(exchange).openStream();
    }

    private String getContentType(HttpExchange exchange) {
        try {
            String extension = FileUtils.getFileExtensionFromPath(getResolveResource(exchange).resourcePath());
            return FileUtils.getContentTypeFromExtension(extension);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }

    }

    private Long getContentLength(HttpExchange exchange) {
        try {
            return getResolveResource(exchange).contentLength();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private ResolvedResource getResolveResource(HttpExchange exchange) throws IOException {
        String relativePath = fixedResourcePath != null ? fixedResourcePath : normalizeRelativePath(exchange.getRequestURI().getPath());
        ResolvedResource resolvedResource = resolveFromRuntimeDirectory(relativePath);
        if (resolvedResource == null) {
            resolvedResource = resolveFromClasspath(relativePath);
        }
        if (resolvedResource == null) {
            throw new java.io.FileNotFoundException("Resource not found: " + relativePath);
        }
        return resolvedResource;
    }

    private ResolvedResource resolveFromRuntimeDirectory(String relativePath) {
        if (!runtimeDirectoryEnabled) {
            return null;
        }

        Path file = runtimeDirectory.resolve(relativePath).normalize();
        if (!file.startsWith(runtimeDirectory) || !Files.isRegularFile(file)) {
            return null;
        }
        return new RuntimeResolvedResource(relativePath, file);
    }

    private ResolvedResource resolveFromClasspath(String relativePath) {
        if (!classpathEnabled) {
            return null;
        }

        ClassLoader classLoader = Thread.currentThread().getContextClassLoader();
        URL resource = classLoader.getResource(relativePath);
        if (resource == null) {
            return null;
        }
        return new ClasspathResolvedResource(relativePath, resource, classLoader);
    }

    private String normalizeRelativePath(String requestPath) {
        if (requestPath == null || requestPath.isEmpty() || "/".equals(requestPath)) {
            throw new IllegalArgumentException("requestPath must point to a file");
        }

        String relativePath = requestPath.startsWith("/") ? requestPath.substring(1) : requestPath;
        if (relativePath.isEmpty() || relativePath.endsWith("/")) {
            throw new IllegalArgumentException("requestPath must point to a file");
        }

        Path normalized = Paths.get(relativePath).normalize();
        String normalizedPath = normalized.toString().replace('\\', '/');
        if (normalizedPath.isEmpty() || normalizedPath.startsWith("..") || "/".equals(normalizedPath)) {
            throw new IllegalArgumentException("Invalid requestPath: " + requestPath);
        }
        return normalizedPath;
    }

    protected interface ResolvedResource {
        InputStream openStream() throws IOException;

        long contentLength() throws IOException;

        String resourcePath();
    }

    private static final class RuntimeResolvedResource implements ResolvedResource {
        private final String resourcePath;
        private final Path file;

        private RuntimeResolvedResource(String resourcePath, Path file) {
            this.resourcePath = resourcePath;
            this.file = file;
        }

        @Override
        public InputStream openStream() throws IOException {
            return Files.newInputStream(file);
        }

        @Override
        public long contentLength() throws IOException {
            return Files.size(file);
        }

        @Override
        public String resourcePath() {
            return resourcePath;
        }
    }

    private static final class ClasspathResolvedResource implements ResolvedResource {
        private final String resourcePath;
        private final URL resourceUrl;
        private final ClassLoader classLoader;

        private ClasspathResolvedResource(String resourcePath, URL resourceUrl, ClassLoader classLoader) {
            this.resourcePath = resourcePath;
            this.resourceUrl = resourceUrl;
            this.classLoader = classLoader;
        }

        @Override
        public InputStream openStream() throws IOException {
            InputStream inputStream = classLoader.getResourceAsStream(resourcePath);
            if (inputStream == null) {
                throw new java.io.FileNotFoundException("Resource not found: " + resourcePath);
            }
            return inputStream;
        }

        @Override
        public long contentLength() throws IOException {
            URLConnection connection = resourceUrl.openConnection();
            return connection.getContentLengthLong();
        }

        @Override
        public String resourcePath() {
            return resourcePath;
        }
    }

    private static List<ApiEndpoint> buildApiEndpoints(List<String> pathPatterns) {
        List<ApiEndpoint> endpoints = new ArrayList<>();
        for (String pathPattern : pathPatterns) {
            endpoints.add(new ApiEndpoint(HttpMethod.GET, pathPattern));
            endpoints.add(new ApiEndpoint(HttpMethod.HEAD, pathPattern));
        }
        return endpoints;
    }
}
