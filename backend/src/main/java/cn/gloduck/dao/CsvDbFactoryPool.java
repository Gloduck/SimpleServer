package cn.gloduck.dao;


import cn.gloduck.api.ApplicationContext;
import cn.gloduck.db.CsvDbFactory;
import cn.gloduck.db.converter.CsvJsonBasedConverter;

public class CsvDbFactoryPool {
    public static final CsvDbFactory clipboard = new CsvDbFactory(
            ApplicationContext.resolveApplicationDirectory().resolve("db").resolve("clipboard").toString(),
            new CsvJsonBasedConverter()
    );
}
