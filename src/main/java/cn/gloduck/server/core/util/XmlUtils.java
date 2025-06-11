package cn.gloduck.server.core.util;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.xml.XmlMapper;

import java.io.IOException;
import java.io.InputStream;

public class XmlUtils {
    private static final ObjectMapper objectMapper = new XmlMapper();

    public static <T> T readValue(InputStream is, Class<T> valueType) throws IOException {
        return objectMapper.readValue(is, valueType);
    }

    public static byte[] writeValueAsBytes(Object value) throws JsonProcessingException {
        return objectMapper.writeValueAsBytes(value);
    }
}
