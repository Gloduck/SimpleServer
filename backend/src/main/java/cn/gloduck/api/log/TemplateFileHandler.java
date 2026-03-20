package cn.gloduck.api.log;

import cn.gloduck.api.ApplicationContext;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.logging.ErrorManager;
import java.util.logging.Formatter;
import java.util.logging.Handler;
import java.util.logging.LogRecord;

public class TemplateFileHandler extends Handler {
    private final Object rotateLock = new Object();
    private final String filePattern;
    private final ZoneId zoneId;
    private final ScheduledExecutorService flushExecutor;
    private volatile Path currentFilePath;
    private volatile BufferedWriter writer;

    public TemplateFileHandler(String filePattern, int flushIntervalSeconds, ZoneId zoneId) {
        this.filePattern = filePattern;
        this.zoneId = zoneId;
        this.flushExecutor = Executors.newSingleThreadScheduledExecutor(new FlushThreadFactory());
        this.flushExecutor.scheduleAtFixedRate(this::safeFlush, flushIntervalSeconds, flushIntervalSeconds, TimeUnit.SECONDS);
    }

    @Override
    public void publish(LogRecord record) {
        if (record == null || !isLoggable(record)) {
            return;
        }

        try {
            Formatter formatter = getFormatter();
            if (formatter == null) {
                throw new IllegalStateException("Formatter is not configured for TemplateFileHandler");
            }

            Path targetFilePath = resolveFilePath(record.getMillis());
            BufferedWriter currentWriter = writer;
            if (currentWriter == null || !targetFilePath.equals(currentFilePath)) {
                currentWriter = rotateWriter(targetFilePath);
            }
            currentWriter.write(formatter.format(record));
        } catch (Exception e) {
            reportError("Failed to write log record", e, ErrorManager.WRITE_FAILURE);
        }
    }

    @Override
    public void flush() {
        BufferedWriter currentWriter = writer;
        if (currentWriter == null) {
            return;
        }

        try {
            currentWriter.flush();
        } catch (IOException e) {
            reportError("Failed to flush log writer", e, ErrorManager.FLUSH_FAILURE);
        }
    }

    @Override
    public void close() throws SecurityException {
        flushExecutor.shutdown();
        synchronized (rotateLock) {
            closeWriter();
        }
    }

    private void safeFlush() {
        try {
            flush();
        } catch (Exception e) {
            reportError("Failed to flush log writer", e, ErrorManager.FLUSH_FAILURE);
        }
    }

    private BufferedWriter rotateWriter(Path targetFilePath) throws IOException {
        synchronized (rotateLock) {
            if (writer != null && targetFilePath.equals(currentFilePath)) {
                return writer;
            }

            closeWriter();
            Path parent = targetFilePath.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            writer = Files.newBufferedWriter(
                    targetFilePath,
                    StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE,
                    StandardOpenOption.APPEND
            );
            currentFilePath = targetFilePath;
            return writer;
        }
    }

    private Path resolveFilePath(long millis) {
        ZonedDateTime dateTime = Instant.ofEpochMilli(millis).atZone(zoneId);
        String relativePath = filePattern
                .replace("${yyyy}", String.format("%04d", dateTime.getYear()))
                .replace("${MM}", String.format("%02d", dateTime.getMonthValue()))
                .replace("${dd}", String.format("%02d", dateTime.getDayOfMonth()))
                .replace("${HH}", String.format("%02d", dateTime.getHour()))
                .replace("${mm}", String.format("%02d", dateTime.getMinute()))
                .replace("${ss}", String.format("%02d", dateTime.getSecond()));
        return ApplicationContext.resolveApplicationDirectory().resolve(relativePath).normalize();
    }

    private void closeWriter() {
        if (writer == null) {
            currentFilePath = null;
            return;
        }

        try {
            writer.flush();
            writer.close();
        } catch (IOException e) {
            reportError("Failed to close log writer", e, ErrorManager.CLOSE_FAILURE);
        } finally {
            writer = null;
            currentFilePath = null;
        }
    }

    private static class FlushThreadFactory implements ThreadFactory {
        @Override
        public Thread newThread(Runnable runnable) {
            Thread thread = new Thread(runnable, "log-flush-thread");
            thread.setDaemon(true);
            return thread;
        }
    }
}
