package cn.gloduck.db.converter;

import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;

public interface ConverterTypeReference<T> {
    default Type getActualType() {
        Type superIface = getClass().getGenericInterfaces()[0];
        return ((ParameterizedType) superIface).getActualTypeArguments()[0];
    }
}
