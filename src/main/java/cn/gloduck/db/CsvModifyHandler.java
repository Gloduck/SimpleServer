package cn.gloduck.db;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVPrinter;
import org.apache.commons.csv.CSVRecord;

import java.io.*;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.*;

public abstract class CsvModifyHandler {
    private List<Map<String, String>> appendRows = new LinkedList<>();

    public CsvModifyHandler(String baseCsvPath, String tableName) {
        this.baseCsvPath = baseCsvPath;
        this.tableName = tableName;
    }

    protected final String baseCsvPath;

    protected final String tableName;

    protected abstract Map<String, String> handleData(Map<String, String> row);

    protected abstract boolean shouldHandleData(Map<String, String> row);

    public int execute() {
        File csvFile = new File(baseCsvPath, tableName + ".csv");
        File tempFile = new File(baseCsvPath, tableName + "_temp.csv");
        File lockFile = new File(baseCsvPath, tableName + ".lock");

        int affectCount = 0;

        // 使用专门的锁文件进行同步
        try (RandomAccessFile lockRaf = new RandomAccessFile(lockFile, "rw");
             FileChannel lockChannel = lockRaf.getChannel();
             FileLock lock = lockChannel.lock()) {
            // 读取、处理、写入临时文件
            List<String> headerNames = null;
            try (FileReader reader = new FileReader(csvFile);
                 CSVParser parser = CSVFormat.DEFAULT.withFirstRecordAsHeader().withTrim().parse(reader);
                 FileWriter writer = new FileWriter(tempFile)) {

                headerNames = parser.getHeaderNames();
                CSVPrinter printer = new CSVPrinter(writer, CSVFormat.DEFAULT.withHeader(headerNames.toArray(new String[0])));
                for (CSVRecord record : parser) {
                    Map<String, String> row = record.toMap();
                    if (shouldHandleData(row)) {
                        row = handleData(row);
                        affectCount++;
                    }
                    if (row != null) {
                        printer.printRecord(row.values());
                    }
                }

                for (Map<String, String> row : appendRows) {
                    printer.printRecord(prepareRecord(headerNames, row));
                }
            } catch (IOException e) {
                throw new RuntimeException("Modify operation failed", e);
            }

            // 替换原文件
            replaceOriginalFile(csvFile, tempFile);

        } catch (IOException e) {
            throw new RuntimeException("Could not obtain lock", e);
        } finally {
            if (lockFile.exists()) {
                lockFile.delete();
            }
        }
        return affectCount;
    }


    private List<String> prepareRecord(List<String> headers, Map<String, String> toAddDatas) {
        List<String> res = new ArrayList<>(headers.size());
        for (String header : headers) {
            res.add(toAddDatas.getOrDefault(header, null));
        }
        return res;
    }

    private void replaceOriginalFile(File original, File temp) throws IOException {
        Files.move(temp.toPath(), original.toPath(), StandardCopyOption.REPLACE_EXISTING);
    }

    protected void appendRow(Map<String, String> row) {
        appendRows.add(row);
    }
}
