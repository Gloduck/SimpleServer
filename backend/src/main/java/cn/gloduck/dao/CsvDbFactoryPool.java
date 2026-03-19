package cn.gloduck.dao;


import cn.gloduck.db.CsvDbFactory;
import cn.gloduck.db.converter.CsvJsonBasedConverter;

public class CsvDbFactoryPool {
    public static final CsvDbFactory clipboard = new CsvDbFactory("./db/clipboard", new CsvJsonBasedConverter());
}
