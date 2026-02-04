package cn.gloduck.api.utils;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Date;

public class DateUtils {
    public static final DateTimeFormatter DASH_SEPARATED_DATE_TIME_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    public static final DateTimeFormatter SLASH_SEPARATED_DATE_TIME_FORMAT_NO_PAD = DateTimeFormatter.ofPattern("yyyy/MM/dd H:m");
    public static final DateTimeFormatter SLASH_SEPARATED_DATE_TIME_FORMAT_PADDED = DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm");
    public static final DateTimeFormatter DASH_SEPARATED_DATE_TIME_FORMAT_PADDED = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    public static final DateTimeFormatter DASH_SEPARATED_DATE_TIME_FORMAT_PADDED_ZONE = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm z");
    public static final DateTimeFormatter DASH_SEPARATED_DATE_TIME_FORMAT_NO_PAD = DateTimeFormatter.ofPattern("yyyy-MM-dd H:m");

    public static Date convertTimeStringToDate(String timeStr, DateTimeFormatter formatter) {
        if (timeStr == null) {
            return null;
        }
        LocalDateTime localDateTime = LocalDateTime.parse(timeStr, formatter);
        ZonedDateTime zdt = localDateTime.atZone(ZoneId.systemDefault());

        return Date.from(zdt.toInstant());
    }
}
