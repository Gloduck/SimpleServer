package cn.gloduck.api.dao;

import cn.gloduck.api.entity.db.OnlineClipBoard;
import cn.gloduck.api.utils.FileUtils;
import cn.gloduck.db.CsvDbFactory;
import cn.gloduck.db.converter.CsvJsonBasedConverter;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.Arrays;

@ApplicationScoped
public class CsvDbFactoryPool {
    private final CsvDbFactory clipboard;

    public CsvDbFactoryPool() {
        this.clipboard = new CsvDbFactory(
                FileUtils.applicationDirectory(CsvDbFactoryPool.class).resolve("db").resolve("clipboard").toString(),
                new CsvJsonBasedConverter()
        );
    }

    @PostConstruct
    void init() {
        clipboard.createDbIfNotExists(OnlineClipBoard.class.getSimpleName(), Arrays.asList(
                OnlineClipBoard.Fileds.ID,
                OnlineClipBoard.Fileds.CONTENT_TYPE,
                OnlineClipBoard.Fileds.CONTENT,
                OnlineClipBoard.Fileds.CREATE_DATE,
                OnlineClipBoard.Fileds.UPDATE_DATE
        ));
    }

    public CsvDbFactory clipboard() {
        return clipboard;
    }
}
