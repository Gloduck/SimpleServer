package cn.gloduck.api.utils;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public class ConfigUtils {
    private static final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
            ;

    public static <T> T loadConfig(String key, Class<T> classz) {
        try {
            Path config = Paths.get("config.json");
            String jsonString;
            if (Files.exists(config)) {
                jsonString = Files.readString(config, StandardCharsets.UTF_8);
            } else {
                jsonString = "{}";
            }
            JsonNode jsonNode = objectMapper.readTree(jsonString);
            JsonNode valueNode;
            if (key != null) {
                valueNode = jsonNode.get(key);
                if (valueNode == null || valueNode.isEmpty()) {
                    valueNode = objectMapper.createObjectNode();
                }
            } else {
                valueNode = jsonNode;
            }

            return objectMapper.treeToValue(valueNode, classz);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
