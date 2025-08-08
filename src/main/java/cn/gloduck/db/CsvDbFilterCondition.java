package cn.gloduck.db;

public interface CsvDbFilterCondition<R extends CsvDbFilterCondition<?>> {


    default R eq(String fieldName, Object value) {
        getFilter().eq(fieldName, value);
        return (R) this;
    }

    default R notEq(String fieldName, Object value) {
        getFilter().notEq(fieldName, value);
        return (R) this;
    }

    default R in(String fieldName, Object... values) {
        getFilter().in(fieldName, values);
        return (R) this;
    }

    default R notIn(String fieldName, Object... values) {
        getFilter().notIn(fieldName, values);
        return (R) this;
    }

    default R like(String fieldName, String pattern) {
        getFilter().like(fieldName, pattern);
        return (R) this;
    }

    default R contains(String fieldName, String pattern) {
        getFilter().contains(fieldName, pattern);
        return (R) this;
    }

    default R gt(String fieldName, Object value) {
        getFilter().gt(fieldName, value);
        return (R) this;
    }

    default R ge(String fieldName, Object value) {
        getFilter().ge(fieldName, value);
        return (R) this;
    }

    default R lt(String fieldName, Object value) {
        getFilter().lt(fieldName, value);
        return (R) this;
    }

    default R le(String fieldName, Object value) {
        getFilter().le(fieldName, value);
        return (R) this;
    }

    CsvDbFilter getFilter();
}
