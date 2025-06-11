package cn.gloduck.db;

import java.util.Map;

public class CsvDbDelete extends CsvModifyHandler implements CsvDbFilterCondition<CsvDbDelete> {
    private final CsvDbFilter dbFilter = new CsvDbFilter();

    private CsvDbDelete(String baseCsvPath, String tableName) {
        super(baseCsvPath, tableName);
    }

    static CsvDbDelete delete(String baseCsvPath, String tableName) {
        return new CsvDbDelete(baseCsvPath, tableName);
    }

    @Override
    public CsvDbFilter getFilter() {
        return this.dbFilter;
    }

    @Override
    protected Map<String, String> handleData(Map<String, String> row) {
        return null;
    }

    @Override
    protected boolean shouldHandleData(Map<String, String> row) {
        return dbFilter.test(row);
    }
}
