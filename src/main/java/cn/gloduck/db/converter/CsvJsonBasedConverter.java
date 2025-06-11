package cn.gloduck.db.converter;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Map;

public class CsvJsonBasedConverter implements CsvDataConvertor {
    private final ObjectMapper objectMapper = new ObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);

    @Override
    public <T> T parseToObject(Map<String, String> dataMap, ConverterTypeReference<T> typeReference) {
        return objectMapper.convertValue(dataMap, new TypeReference<T>() {
        });
    }

    @Override
    public <T> Map<String, String> parseToMap(T source, ConverterTypeReference<T> typeReference) {
        return objectMapper.convertValue(source, new TypeReference<Map<String, String>>() {
        });
    }
}
