package cn.gloduck.api.config;

import cn.gloduck.api.utils.FileUtils;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public final class ConfigFileLoader {
    public static final String CONFIG_FILE_NAME = "config.json";

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private ConfigFileLoader() {
    }

    public static JsonNode loadRootNode() {
        try {
            String content = readConfigContent();
            if (content == null || content.isBlank()) {
                return JsonNodeFactory.instance.objectNode();
            }
            return OBJECT_MAPPER.readTree(content);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to load " + CONFIG_FILE_NAME, e);
        }
    }

    private static String readConfigContent() throws Exception {
        Path appConfig = FileUtils.applicationDirectory(ConfigFileLoader.class).resolve(CONFIG_FILE_NAME);
        if (Files.exists(appConfig)) {
            return Files.readString(appConfig, StandardCharsets.UTF_8);
        }

        try (InputStream inputStream = ConfigFileLoader.class.getClassLoader().getResourceAsStream(CONFIG_FILE_NAME)) {
            return inputStream == null ? null : new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
