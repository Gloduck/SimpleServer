package cn.gloduck.api.utils;

public class StringUtils {
    private static final int INDEX_NOT_FOUND = -1;

    public static String subBetween(CharSequence str, CharSequence beforeAndAfter) {
        return subBetween(str, beforeAndAfter, beforeAndAfter);
    }

    public static String subBetween(CharSequence str, CharSequence before, CharSequence after) {
        if (str == null || before == null || after == null) {
            return null;
        }

        final String str2 = str.toString();
        final String before2 = before.toString();
        final String after2 = after.toString();

        final int start = str2.indexOf(before2);
        if (start != INDEX_NOT_FOUND) {
            final int end = str2.indexOf(after2, start + before2.length());
            if (end != INDEX_NOT_FOUND) {
                return str2.substring(start + before2.length(), end);
            }
        }
        return null;
    }

}
