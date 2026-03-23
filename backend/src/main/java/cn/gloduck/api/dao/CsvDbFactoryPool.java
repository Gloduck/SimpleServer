package cn.gloduck.api.dao;

import cn.gloduck.api.ApplicationContext;
import cn.gloduck.api.entity.db.OnlineClipBoard;
import cn.gloduck.db.CsvDbFactory;
import cn.gloduck.db.converter.CsvJsonBasedConverter;

import java.util.Arrays;

public class CsvDbFactoryPool {
    public static final CsvDbFactory clipboard = new CsvDbFactory(
            ApplicationContext.resolveApplicationDirectory().resolve("db").resolve("clipboard").toString(),
            new CsvJsonBasedConverter()
    );

    public static void init() {
        clipboard.createDbIfNotExists(OnlineClipBoard.class.getSimpleName(), Arrays.asList(
                OnlineClipBoard.Fileds.ID,
                OnlineClipBoard.Fileds.CONTENT_TYPE,
                OnlineClipBoard.Fileds.CONTENT,
                OnlineClipBoard.Fileds.CREATE_DATE,
                OnlineClipBoard.Fileds.UPDATE_DATE
        ));
    }
}
