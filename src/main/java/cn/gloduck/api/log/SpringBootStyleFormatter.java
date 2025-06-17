package cn.gloduck.api.log;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.logging.Formatter;
import java.util.logging.Level;
import java.util.logging.LogRecord;

public class SpringBootStyleFormatter extends Formatter {
    private static final DateTimeFormatter DATE_FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS")
                    .withZone(ZoneId.systemDefault());
    private static final String PID = getPID();

    // ANSI颜色代码
    private static final String RESET = "\u001B[0m";
    private static final String RED = "\u001B[31m";
    private static final String GREEN = "\u001B[32m";
    private static final String YELLOW = "\u001B[33m";
    private static final String BLUE = "\u001B[34m";
    private static final String CYAN = "\u001B[36m";
    private static final String WHITE = "\u001B[37m";
    private static final String MAGENTA = "\u001B[35m";

    @Override
    public String format(LogRecord record) {
        StringBuilder sb = new StringBuilder(256);
        Instant instant = Instant.ofEpochMilli(record.getMillis());
        sb.append(CYAN)
                .append(DATE_FORMATTER.format(instant))
                .append(RESET)
                .append(" ");

        String levelName = record.getLevel().getName();
        String levelColor = getLevelColor(record.getLevel());
        sb.append(levelColor)
                .append(String.format("%-7s", levelName))
                .append(RESET)
                .append(" ");

        sb.append(MAGENTA).append(PID).append(RESET).append(" --- ");

        sb.append("[")
                .append(WHITE)
                .append(Thread.currentThread().getName())
                .append(RESET)
                .append("] ");

        String className = record.getSourceClassName();
        if (className != null) {
            String simpleClassName = className.substring(className.lastIndexOf('.') + 1);
            sb.append(YELLOW).append(simpleClassName).append(RESET);
        }

        sb.append(" : ").append(formatMessage(record));

        if (record.getThrown() != null) {
            sb.append("\n").append(RED).append("异常信息: ").append(RESET);
            Throwable throwable = record.getThrown();
            sb.append(throwable.toString()).append("\n");
            for (StackTraceElement element : throwable.getStackTrace()) {
                sb.append("\t").append(element.toString()).append("\n");
            }
        }

        sb.append("\n");
        return sb.toString();
    }

    private String getLevelColor(Level level) {
        if (level == Level.SEVERE) {
            return RED;
        }
        if (level == Level.WARNING) {
            return YELLOW;
        }
        if (level == Level.INFO) {
            return GREEN;
        }
        if (level == Level.CONFIG) {
            return BLUE;
        }
        if (level == Level.FINE || level == Level.FINER || level == Level.FINEST) {
            return CYAN;
        }
        return WHITE;
    }

    private static String getPID() {
        try {
            String jvmName = java.lang.management.ManagementFactory.getRuntimeMXBean().getName();
            return jvmName.split("@")[0];
        } catch (Exception e) {
            return "?????";
        }
    }
}
