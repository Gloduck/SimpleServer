package cn.gloduck.api.utils;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public class ConfigUtils {
    private static final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private static final String CONFIG_FILE_NAME = "config.json";
    private static volatile JsonNode configRoot;

    public static void init() {
        if (configRoot != null) {
            return;
        }

        synchronized (ConfigUtils.class) {
            if (configRoot != null) {
                return;
            }

            try {
                configRoot = objectMapper.readTree(loadConfigContent());
            } catch (Exception e) {
                throw new RuntimeException("Failed to initialize config", e);
            }
        }
    }

    public static <T> T loadConfig(String key, Class<T> classz) {
        if (configRoot == null) {
            throw new RuntimeException("Config not initialized");
        }
        
        try {
            JsonNode valueNode = key == null ? configRoot : configRoot.get(key);
            if (valueNode == null || valueNode.isEmpty()) {
                valueNode = objectMapper.createObjectNode();
            }
            return objectMapper.treeToValue(valueNode, classz);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static String loadConfigContent() throws Exception {
        Path runtimeConfigPath = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize().resolve(CONFIG_FILE_NAME);
        if (Files.exists(runtimeConfigPath)) {
            return Files.readString(runtimeConfigPath, StandardCharsets.UTF_8);
        }

        try (InputStream inputStream = ConfigUtils.class.getClassLoader().getResourceAsStream(CONFIG_FILE_NAME)) {
            if (inputStream == null) {
                return "{}";
            }
            return new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
