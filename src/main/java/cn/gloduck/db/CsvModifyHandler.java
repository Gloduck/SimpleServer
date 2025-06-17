package cn.gloduck.db;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVPrinter;
import org.apache.commons.csv.CSVRecord;

import java.io.*;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.locks.ReentrantLock;

public abstract class CsvModifyHandler {
    private static final ReentrantLock INTRA_JVM_LOCK = new ReentrantLock();

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
        INTRA_JVM_LOCK.lock();
        try {
            // 用一个专门的 .lock 文件做进程间的“锁”
            Path lockPath = Paths.get(baseCsvPath, tableName + ".lock");
            try (
                    FileChannel lockChannel = FileChannel.open(lockPath,
                            StandardOpenOption.CREATE,
                            StandardOpenOption.WRITE);
                    FileLock ignored = lockChannel.lock()
            ) {
                return doModifyCsv();
            } finally {
                try {
                    Files.deleteIfExists(lockPath);
                } catch (IOException ignore) {
                }
            }
        } catch (IOException e) {
            throw new RuntimeException("Failed to lock/modify CSV", e);
        } finally {
            INTRA_JVM_LOCK.unlock();
        }
    }

    private int doModifyCsv() throws IOException {
        File csvFile = new File(baseCsvPath, tableName + ".csv");
        File tmpFile = new File(baseCsvPath, tableName + "_temp.csv");
        int affectCount = 0;

        try (
                Reader reader = new InputStreamReader(
                        new FileInputStream(csvFile),
                        StandardCharsets.UTF_8);
                CSVParser parser = CSVFormat.DEFAULT
                        .withFirstRecordAsHeader()
                        .withTrim()
                        .parse(reader);
                Writer writer = new OutputStreamWriter(
                        new FileOutputStream(tmpFile),
                        StandardCharsets.UTF_8);
                CSVPrinter printer = new CSVPrinter(
                        writer,
                        CSVFormat.DEFAULT
                                .withHeader(parser.getHeaderNames().toArray(new String[0])));
        ) {
            List<String> headers = parser.getHeaderNames();
            for (CSVRecord rec : parser) {
                Map<String, String> row = rec.toMap();
                if (shouldHandleData(row)) {
                    row = handleData(row);
                    affectCount++;
                }
                if (row != null) {
                    printer.printRecord(prepareRecord(headers, row));
                }
            }
            // 追加新行
            for (Map<String, String> row : appendRows) {
                printer.printRecord(prepareRecord(headers, row));
                affectCount++;
            }
            printer.flush();
        }

        Files.move(
                tmpFile.toPath(),
                csvFile.toPath(),
                StandardCopyOption.REPLACE_EXISTING,
                StandardCopyOption.ATOMIC_MOVE
        );
        return affectCount;
    }

    private List<String> prepareRecord(List<String> headers, Map<String, String> toAddDatas) {
        List<String> res = new ArrayList<>(headers.size());
        for (String header : headers) {
            res.add(toAddDatas.getOrDefault(header, null));
        }
        return res;
    }

    protected void appendRow(Map<String, String> row) {
        appendRows.add(row);
    }
}
