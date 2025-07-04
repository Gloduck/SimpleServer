package cn.gloduck.db;

import cn.gloduck.db.converter.CsvDataConvertor;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.List;
import java.util.Map;

public class CsvDbFactory {
    private final CsvDataConvertor convertor;

    private final String csvFilePath;

    public CsvDbFactory(String csvFilePath, CsvDataConvertor convertor) {
        this.csvFilePath = csvFilePath;
        this.convertor = convertor;
    }

    public void createTable(String tableName, List<String> headers) {
        boolean createSuccess = createDbIfNotExists(tableName, headers);
        if (!createSuccess) {
            throw new RuntimeException(String.format("Table with name %s already exists", tableName));
        }
    }

    public boolean createDbIfNotExists(String tableName, List<String> headers) {
        File csvFile = getCsvFileByTableName(tableName);
        if (csvFile.exists()) {
            return false;
        }
        try (
                FileWriter writer = new FileWriter(csvFile);
                CSVPrinter printer = new CSVPrinter(writer, CSVFormat.DEFAULT.withHeader(headers.toArray(new String[0])));
        ) {
            printer.flush();
        } catch (IOException e) {
            throw new RuntimeException("Create table failed", e);
        }
        return true;
    }

    public void deleteTable(String tableName) {
        File csvFile = new File(csvFilePath, tableName + ".csv");
        if (!csvFile.exists()) {
            throw new RuntimeException(String.format("Table with name %s not exists", tableName));
        }
        if (!csvFile.delete()) {
            throw new RuntimeException(String.format("Delete table with name %s failed", tableName));
        }
    }

    public <T> CsvDbQuery<T> selectFrom(Class<T> classz) {
        return CsvDbQuery.select(csvFilePath, getTableNameByClass(classz), convertor, classz);
    }

    public <T> CsvDbQuery<T> selectFrom(String tableName, Class<T> classz) {
        return CsvDbQuery.select(csvFilePath, tableName, convertor, classz);
    }

    public CsvDbQuery<Map<String, String>> selectFrom(String tableName, String... fieldNames) {
        return CsvDbQuery.select(csvFilePath, tableName, fieldNames);
    }

    public CsvDbUpdate update(String tableName) {
        return CsvDbUpdate.update(csvFilePath, tableName);
    }

    public CsvDbUpdate update(Class<?> classz) {
        return CsvDbUpdate.update(csvFilePath, getTableNameByClass(classz));
    }

    public CsvDbDelete deleteFrom(String tableName) {
        return CsvDbDelete.delete(csvFilePath, tableName);
    }

    public CsvDbDelete deleteFrom(Class<?> classz) {
        return CsvDbDelete.delete(csvFilePath, getTableNameByClass(classz));
    }

    public <T> CsvDbUpdateBy<T> updateBy(Class<T> classz, String tableName, String fieldName) {
        return CsvDbUpdateBy.updateBy(csvFilePath, tableName, fieldName, convertor, classz);
    }

    public <T> CsvDbUpdateBy<T> updateBy(Class<T> classz, String fieldName) {
        return CsvDbUpdateBy.updateBy(csvFilePath, getTableNameByClass(classz), fieldName, convertor, classz);
    }

    public CsvDbUpdateBy<Map<String, String>> updateBy(String tableName, String fieldName) {
        return CsvDbUpdateBy.updateBy(csvFilePath, tableName, fieldName);
    }

    public <T> CsvDbInsert<T> insertInto(Class<T> classz, String tableName) {
        return CsvDbInsert.insertInto(csvFilePath, tableName, convertor, classz);
    }

    public <T> CsvDbInsert<T> insertInto(Class<T> classz) {
        return CsvDbInsert.insertInto(csvFilePath, getTableNameByClass(classz), convertor, classz);
    }

    public CsvDbInsert<Map<String, String>> insertInto(String tableName) {
        return CsvDbInsert.insertInto(csvFilePath, tableName);
    }

    private String getTableNameByClass(Class<?> classz) {
        return classz.getSimpleName();
    }

    private File getCsvFileByTableName(String tableName) {
        return new File(csvFilePath, tableName + ".csv");
    }


    private File getTempCsvFileByTableName(String tableName) {
        return new File(csvFilePath, tableName + "_temp.csv");
    }
}
