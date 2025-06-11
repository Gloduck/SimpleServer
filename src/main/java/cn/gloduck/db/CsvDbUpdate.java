package cn.gloduck.db;

import java.util.Map;

public class CsvDbUpdate extends CsvModifyHandler implements CsvDbFilterCondition<CsvDbUpdate> {

    private final CsvDbFilter dbFilter = new CsvDbFilter();
    private final Map<String, Object> updates = new java.util.HashMap<>();

    private CsvDbUpdate(String baseCsvPath, String tableName) {
        super(baseCsvPath, tableName);
    }

    static CsvDbUpdate update(String baseCsvPath, String tableName) {
        return new CsvDbUpdate(baseCsvPath, tableName);
    }

    public CsvDbUpdate set(String field, Object value) {
        updates.put(field, value);
        return this;
    }

    @Override
    public CsvDbFilter getFilter() {
        return dbFilter;
    }

    @Override
    protected Map<String, String> handleData(Map<String, String> row) {
        applyUpdates(row);
        return row;
    }

    @Override
    protected boolean shouldHandleData(Map<String, String> row) {
        return dbFilter.test(row);
    }

    private void applyUpdates(Map<String, String> row) {
        updates.forEach((field, value) -> {
            row.put(field, value == null ? null : value.toString());
        });
    }

}
