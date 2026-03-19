package cn.gloduck.api.entity.db;

import lombok.Data;

import java.util.Date;

@Data
public class OnlineClipBoard {
    private String id;

    private String contentType;

    private String content;

    private Date createDate;

    private Date updateDate;

    public static class Fileds {
        public static final String ID = "id";

        public static final String CONTENT = "content";

        public static final String CONTENT_TYPE = "contentType";

        public static final String CREATE_DATE = "createDate";

        public static final String UPDATE_DATE = "updateDate";
    }
}
