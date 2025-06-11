package cn.gloduck.db.converter;

import java.util.Map;

public interface CsvDataConvertor {
    <T> T parseToObject(Map<String, String> dataMap, ConverterTypeReference<T> typeReference);

    <T> Map<String, String> parseToMap(T source, ConverterTypeReference<T> typeReference);
}
