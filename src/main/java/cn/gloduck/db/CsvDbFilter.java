package cn.gloduck.db;

import java.util.*;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
import java.util.stream.Collectors;

public class CsvDbFilter implements Predicate<Map<String, String>> {
    private List<Predicate<Map<String, String>>> filters = new ArrayList<>();


    public void eq(String fieldName, Object value) {
        filters.add(m -> Objects.equals(m.get(fieldName), value == null ? null : value.toString()));

    }

    public void notEq(String fieldName, Object value) {
        filters.add(m -> !Objects.equals(m.get(fieldName), value == null ? null : value.toString()));

    }

    public void in(String fieldName, Object... values) {
        Set<String> set = Arrays.stream(values)
                .map(v -> v == null ? null : v.toString())
                .collect(Collectors.toSet());
        filters.add(m -> set.contains(m.get(fieldName)));

    }

    public void notIn(String fieldName, Object... values) {
        Set<String> set = Arrays.stream(values)
                .map(v -> v == null ? null : v.toString())
                .collect(Collectors.toSet());
        filters.add(m -> !set.contains(m.get(fieldName)));

    }

    public void like(String fieldName, String pattern) {
        filters.add(m -> {
            String v = m.get(fieldName);
            if (v == null) {
                return false;
            }
            try {
                Pattern p = Pattern.compile(pattern);
                Matcher matcher = p.matcher(v);
                return matcher.find();
            } catch (PatternSyntaxException e) {
                return false;
            }
        });
    }

    public void contains(String fieldName, String value) {
        filters.add(m -> {
            String v = m.get(fieldName);
            return v != null && v.contains(value);
        });
    }

    public void gt(String fieldName, Object value) {
        cmp(fieldName, value, (c) -> c > 0);
    }

    public void ge(String fieldName, Object value) {
        cmp(fieldName, value, (c) -> c >= 0);
    }

    public void lt(String fieldName, Object value) {
        cmp(fieldName, value, (c) -> c < 0);
    }

    public void le(String fieldName, Object value) {
        cmp(fieldName, value, (c) -> c <= 0);
    }

    private void cmp(String fieldName, Object value, java.util.function.IntPredicate tester) {
        String cmpTo = value == null ? null : value.toString();
        filters.add(m -> {
            String v = m.get(fieldName);
            if (v == null || cmpTo == null) return false;
            int c = compare(v, cmpTo);
            return tester.test(c);
        });

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
    public boolean test(Map<String, String> row) {
        for (Predicate<Map<String, String>> f : filters) {
            if (!f.test(row)) {
                return false;
            }
        }
        return true;
    }
}
