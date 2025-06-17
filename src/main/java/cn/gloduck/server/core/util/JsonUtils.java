package cn.gloduck.server.core.util;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;

public class JsonUtils {
    private static final ObjectMapper objectMapper = new ObjectMapper();

    public static <T> T readValue(InputStream is, Class<T> valueType) {
        try {
            return objectMapper.readValue(is, valueType);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    public static byte[] writeValueAsBytes(Object value) {
        try {
            return objectMapper.writeValueAsBytes(value);
        } catch (JsonProcessingException e) {
            throw new RuntimeException(e);
        }
    }
}
