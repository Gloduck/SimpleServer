package cn.gloduck.db;

import cn.gloduck.db.converter.ConverterTypeReference;
import cn.gloduck.db.converter.CsvDataConvertor;

import java.lang.reflect.Type;
import java.util.List;
import java.util.Map;

public class CsvDbInsert<T> extends CsvModifyHandler {
    private static final ConverterTypeReference<Map<String, String>> DEFAULT_TYPE_REFERENCE = new ConverterTypeReference<Map<String, String>>() {
    };

    private final CsvDataConvertor convertor;

    private final ConverterTypeReference<T> typeReference;

    private CsvDbInsert(String baseCsvPath, String tableName, CsvDataConvertor convertor, ConverterTypeReference<T> typeReference) {
        super(baseCsvPath, tableName);
        this.typeReference = typeReference;
        this.convertor = convertor;
    }

    static <R> CsvDbInsert<R> insertInto(String baseCsvPath, String tableName, CsvDataConvertor convertor, Class<R> classz) {
        return new CsvDbInsert(baseCsvPath, tableName, convertor, new ConverterTypeReference<R>() {
            @Override
            public Type getActualType() {
                return classz;
            }
        });
    }

    static CsvDbInsert<Map<String, String>> insertInto(String baseCsvPath, String tableName) {
        return new CsvDbInsert(baseCsvPath, tableName, null, DEFAULT_TYPE_REFERENCE);
    }

    public CsvDbInsert<T> value(T value) {
        if (convertor == DEFAULT_TYPE_REFERENCE) {
            appendRow((Map<String, String>) value);
        } else {
            appendRow(convertor.parseToMap(value, typeReference));
        }
        return this;
    }

    public CsvDbInsert<T> values(List<T> values) {
        for (T value : values) {
            value(value);
        }
        return this;
    }

    @Override
    protected Map<String, String> handleData(Map<String, String> row) {
        throw new UnsupportedOperationException();
    }

    @Override
    protected boolean shouldHandleData(Map<String, String> row) {
        return false;
    }

}
