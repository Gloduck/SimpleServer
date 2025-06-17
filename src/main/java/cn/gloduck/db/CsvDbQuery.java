package cn.gloduck.db;

import cn.gloduck.db.converter.ConverterTypeReference;
import cn.gloduck.db.converter.CsvDataConvertor;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;

import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.lang.reflect.Type;
import java.util.*;
import java.util.stream.Collectors;

public class CsvDbQuery<T> implements CsvDbFilterCondition<CsvDbQuery<T>> {
    private final ConverterTypeReference<T> typeReference;

    private final CsvDataConvertor convertor;

    private final String baseCsvPath;

    private final CsvDbFilter dbFilter = new CsvDbFilter();

    private final String tableName;


    private static final ConverterTypeReference<Map<String, String>> DEFAULT_TYPE_REFERENCE = new ConverterTypeReference<Map<String, String>>() {
    };

    private List<String> selectFields = new ArrayList<>();
    private String orderByField;
    private boolean orderDesc = false;

    private long limit = Long.MAX_VALUE;
    private long offset = 0;

    private CsvDbQuery(String baseCsvPath, String tableName, CsvDataConvertor convertor, ConverterTypeReference<T> typeReference) {
        this.typeReference = typeReference;
        this.baseCsvPath = baseCsvPath;
        this.convertor = convertor;
        this.tableName = tableName;
    }

    static <R> CsvDbQuery<R> select(String baseCsvPath, String tableName, CsvDataConvertor convertor, Class<R> classz) {
        return new CsvDbQuery<R>(baseCsvPath, tableName, convertor, new ConverterTypeReference<R>() {
            @Override
            public Type getActualType() {
                return classz;
            }
        });
    }

    static CsvDbQuery<Map<String, String>> select(String baseCsvPath, String tableName, String... fieldNames) {
        CsvDbQuery<Map<String, String>> q = new CsvDbQuery<Map<String, String>>(baseCsvPath, tableName, null, DEFAULT_TYPE_REFERENCE);
        if (fieldNames != null && fieldNames.length > 0) {
            q.selectFields = Arrays.asList(fieldNames);
        }
        return q;
    }

    public CsvDbQuery<T> orderBy(String fieldName, boolean desc) {
        this.orderByField = fieldName;
        this.orderDesc = desc;
        return this;
    }

    public CsvDbQuery<T> limit(long limit) {
        this.limit = limit;
        return this;
    }

    public CsvDbQuery<T> offset(long offset) {
        this.offset = offset;
        return this;
    }

    public List<T> fetch() {
        File csvFile = new File(baseCsvPath, tableName + ".csv");
        List<Map<String, String>> rows = new ArrayList<>();

        try (FileReader reader = new FileReader(csvFile);
             CSVParser parser = CSVFormat.DEFAULT
                     .withFirstRecordAsHeader()
                     .withTrim()
                     .parse(reader)) {

            for (CSVRecord rec : parser) {
                Map<String, String> row = rec.toMap();
                if (dbFilter.test(row)) {
                    rows.add(row);
                }
            }

        } catch (IOException e) {
            throw new RuntimeException("Read Csv file in path: " + csvFile.getAbsolutePath() + " error", e);
        }

        if (orderByField != null) {
            rows.sort((a, b) -> {
                String va = a.get(orderByField);
                String vb = b.get(orderByField);
                int c = compare(va, vb);
                return orderDesc ? -c : c;
            });
        }

        int start = (int) Math.min(offset, rows.size());
        int end = (int) Math.min(start + limit, rows.size());
        List<Map<String, String>> slice = rows.subList(start, end);

        return (List<T>) slice.stream().map(r -> {
            Map<String, String> m2;
            if (selectFields.isEmpty()) {
                m2 = r;
            } else {
                m2 = new LinkedHashMap<>();
                for (String f : selectFields) {
                    m2.put(f, r.get(f));
                }
            }
            if (typeReference == DEFAULT_TYPE_REFERENCE) {
                return m2;
            } else {
                return convertor.parseToObject(m2, typeReference);
            }
        }).collect(Collectors.toList());
    }

    public T fetchOne() {
        List<T> list = fetch();
        return list.isEmpty() ? null : list.get(0);
    }

    /**
     * 尝试数字比较，失败回退到字符串比较
     */
    private static int compare(String a, String b) {
        if (a == null && b == null) {
            return 0;
        }
        if (a == null) {
            return -1;
        }
        if (b == null) {
            return 1;
        }
        try {
            double da = Double.parseDouble(a);
            double db = Double.parseDouble(b);
            return Double.compare(da, db);
        } catch (Exception e) {
            return a.compareTo(b);
        }
    }

    @Override
    public CsvDbFilter getFilter() {
        return this.dbFilter;
    }
}
