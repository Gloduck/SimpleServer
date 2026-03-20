package cn.gloduck.api;

import cn.gloduck.api.entity.config.ServerConfig;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.CodeSource;
import java.util.Locale;

public class ApplicationContext {
    private static final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private static final String CONFIG_FILE_NAME = "config.json";
    private static boolean initialized = false;
    private static JsonNode configRoot;

    public static void init() {
        if (initialized) {
            throw new RuntimeException("ApplicationContext is already initialized");
        }
        synchronized (ApplicationContext.class) {
            if (configRoot != null) {
                return;
            }

            loadConfigContent();
            initialized = true;
        }
    }

    public static ServerConfig getGlobalConfig() {
        return getConfig(null, ServerConfig.class);
    }

    public static <T> T getConfig(Class<T> tClass) {
        String configName = tClass.getSimpleName().toLowerCase(Locale.ROOT);
        if (configName.endsWith("config")) {
            configName = configName.substring(0, configName.lastIndexOf("config"));
        }
        return getConfig(configName, tClass);
    }

    private static <T> T getConfig(String key, Class<T> tClass) {
        JsonNode valueNode = key == null ? configRoot : configRoot.get(key);
        if (valueNode == null || valueNode.isEmpty()) {
            valueNode = objectMapper.createObjectNode();
        }
        T config = null;
        try {
            config = objectMapper.treeToValue(valueNode, tClass);
        } catch (JsonProcessingException e) {
            throw new RuntimeException(e);
        }
        return config;
    }

    public static Path resolveApplicationDirectory() {
        try {
            CodeSource codeSource = ApplicationContext.class.getProtectionDomain().getCodeSource();
            if (codeSource == null) {
                return Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
            }

            URL location = codeSource.getLocation();
            if (location == null) {
                return Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
            }

            Path path = Path.of(URI.create(location.toString())).toAbsolutePath().normalize();
            return Files.isRegularFile(path) ? path.getParent() : path;
        } catch (Exception e) {
            return Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        }
    }

    private static void loadConfigContent() {
        String content = "{}";
        try {
            Path appConfigPath = resolveApplicationDirectory().resolve(CONFIG_FILE_NAME);
            if (Files.exists(appConfigPath)) {
                content = Files.readString(appConfigPath, StandardCharsets.UTF_8);
            } else {
                try (InputStream inputStream = ApplicationContext.class.getClassLoader().getResourceAsStream(CONFIG_FILE_NAME)) {
                    if (inputStream != null) {
                        content = new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
                    }
                }
            }
            configRoot = objectMapper.readTree(content);
        } catch (Exception e) {
            throw new RuntimeException("Failed to load config", e);
        }
    }

}
