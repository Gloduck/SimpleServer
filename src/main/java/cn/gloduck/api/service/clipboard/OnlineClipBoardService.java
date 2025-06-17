package cn.gloduck.api.service.clipboard;

import cn.gloduck.api.entity.db.OnlineClipBoard;
import cn.gloduck.dao.CsvDbFactoryPool;
import cn.gloduck.db.CsvDbFactory;

import java.util.Date;
import java.util.Objects;

public class OnlineClipBoardService {
    private static OnlineClipBoardService instance;

    private final CsvDbFactory clipboardFactory = CsvDbFactoryPool.clipboard;

    public boolean save(OnlineClipBoard data) {
        OnlineClipBoard existData = clipboardFactory
                .selectFrom(OnlineClipBoard.class)
                .eq(OnlineClipBoard.Fileds.ID, data.getId())
                .fetchOne();
        Date now = new Date();
        if (existData != null) {
            if (Objects.equals(existData.getContentType(), data.getContentType()) && Objects.equals(existData.getContent(), data.getContent())) {
                return true;
            }
            existData.setContent(data.getContent());
            existData.setContentType(data.getContentType());
            existData.setUpdateDate(now);
            int execute = clipboardFactory.updateBy(OnlineClipBoard.class, OnlineClipBoard.Fileds.ID)
                    .value(existData)
                    .execute();
            return execute > 0;
        } else {
            OnlineClipBoard newData = new OnlineClipBoard();
            newData.setId(data.getId());
            newData.setContent(data.getContent());
            newData.setContentType(data.getContentType());
            newData.setUpdateDate(now);
            newData.setCreateDate(now);
            int execute = clipboardFactory.insertInto(OnlineClipBoard.class)
                    .value(newData)
                    .execute();
            return execute > 0;
        }
    }

    public boolean delete(String id) {
        int execute = clipboardFactory.deleteFrom(OnlineClipBoard.class)
                .eq(OnlineClipBoard.Fileds.ID, id)
                .execute();
        return execute > 0;
    }

    public OnlineClipBoard getById(String id) {
        if (id == null || id.isEmpty()) {
            return null;
        }
        return clipboardFactory.selectFrom(OnlineClipBoard.class)
                .eq(OnlineClipBoard.Fileds.ID, id)
                .fetchOne();
    }


    public static OnlineClipBoardService instance() {
        if (instance == null) {
            instance = new OnlineClipBoardService();
        }
        return instance;
    }
}
