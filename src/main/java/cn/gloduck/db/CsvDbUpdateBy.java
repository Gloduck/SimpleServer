package cn.gloduck.db;

import cn.gloduck.db.converter.ConverterTypeReference;
import cn.gloduck.db.converter.CsvDataConvertor;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class CsvDbUpdateBy<T> extends CsvModifyHandler {
    private static final ConverterTypeReference<Map<String, String>> DEFAULT_TYPE_REFERENCE = new ConverterTypeReference<Map<String, String>>() {
    };
    private final ConverterTypeReference<T> typeReference;

    private final CsvDataConvertor convertor;
    private final String filedName;


    private final Map<String, Map<String, String>> updateDatas = new HashMap<>();

    private CsvDbUpdateBy(String baseCsvPath, String tableName, String filedName, CsvDataConvertor convertor, ConverterTypeReference<T> typeReference) {
        super(baseCsvPath, tableName);
        this.filedName = filedName;
        this.typeReference = typeReference;
        this.convertor = convertor;
    }

    static <R> CsvDbUpdateBy<R> updateBy(String baseCsvPath, String tableName, String filedName, CsvDataConvertor convertor, Class<R> classz) {
        return new CsvDbUpdateBy<R>(baseCsvPath, tableName, filedName, convertor, new ConverterTypeReference<R>() {
        });
    }

    static CsvDbUpdateBy<Map<String, String>> updateBy(String baseCsvPath, String tableName, String filedName) {
        return new CsvDbUpdateBy<Map<String, String>>(baseCsvPath, tableName, filedName, null, DEFAULT_TYPE_REFERENCE);
    }

    public CsvDbUpdateBy<T> value(T value) {
        Map<String, String> toUpdateDatas;
        if (convertor == DEFAULT_TYPE_REFERENCE) {
            toUpdateDatas = (Map<String, String>) value;
        } else {
            toUpdateDatas = convertor.parseToMap(value, typeReference);
        }
        String curValue = toUpdateDatas.get(filedName);
        if (curValue == null) {
            throw new RuntimeException(String.format("The field name %s does not exist in the data", filedName));
        }
        this.updateDatas.put(curValue, toUpdateDatas);
        return this;
    }

    public CsvDbUpdateBy<T> values(List<T> values) {
        for (T data : values) {
            value(data);
        }
        return this;
    }

    @Override
    protected Map<String, String> handleData(Map<String, String> row) {
        return updateDatas.get(row.get(filedName));
    }

    @Override
    protected boolean shouldHandleData(Map<String, String> row) {
        String curValue = row.get(filedName);
        if (curValue == null) {
            return false;
        }
        return updateDatas.containsKey(curValue);
    }
}
