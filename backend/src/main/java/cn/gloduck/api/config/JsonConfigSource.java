package cn.gloduck.api.config;

import cn.gloduck.api.entity.config.LogConfig;
import cn.gloduck.api.entity.config.ServerConfig;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.eclipse.microprofile.config.spi.ConfigSource;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

public class JsonConfigSource implements ConfigSource {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private final Map<String, String> properties;

    public JsonConfigSource() {
        this.properties = loadProperties();
    }

    @Override
    public Map<String, String> getProperties() {
        return properties;
    }

    @Override
    public Set<String> getPropertyNames() {
        return properties.keySet();
    }

    @Override
    public String getValue(String propertyName) {
        return properties.get(propertyName);
    }

    @Override
    public String getName() {
        return ConfigFileLoader.CONFIG_FILE_NAME;
    }

    @Override
    public int getOrdinal() {
        return 260;
    }

    private Map<String, String> loadProperties() {
        try {
            Map<String, String> values = new LinkedHashMap<>();
            applyQuarkusDefaults(values);

            applyConfigLogic(values, OBJECT_MAPPER.treeToValue(ConfigFileLoader.loadRootNode(), ServerConfig.class));
            return Collections.unmodifiableMap(values);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to load " + ConfigFileLoader.CONFIG_FILE_NAME, e);
        }
    }

    private void applyQuarkusDefaults(Map<String, String> values) {
        values.put("quarkus.jackson.write-dates-as-timestamps", "true");
        values.put("quarkus.package.jar.type", "uber-jar");
        values.put("quarkus.banner.enabled", "false");
        values.put("quarkus.log.console.format", "%d{yyyy-MM-dd HH:mm:ss,SSS} %-5p %s%e%n");
    }

    private void applyConfigLogic(Map<String, String> values, ServerConfig serverConfig) {
        if (serverConfig == null) {
            return;
        }

        if (serverConfig.port != null) {
            values.putIfAbsent("quarkus.http.port", serverConfig.port.toString());
        }

        LogConfig logConfig = serverConfig.log;
        if (logConfig == null) {
            return;
        }
        if (logConfig.level != null && !logConfig.level.isBlank()) {
            values.putIfAbsent("quarkus.log.level", logConfig.level);
        }
        if (logConfig.file != null && !logConfig.file.isBlank()) {
            applyLogFileConfig(values, logConfig.file);
        }
    }

    private void applyLogFileConfig(Map<String, String> values, String logFile) {
        if (logFile == null || logFile.isBlank()) {
            return;
        }

        values.putIfAbsent("quarkus.log.file.enable", "true");
        values.putIfAbsent("quarkus.log.file.path", logFile);
    }

}
