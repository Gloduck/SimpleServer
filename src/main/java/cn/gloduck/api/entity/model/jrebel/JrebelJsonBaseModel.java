package cn.gloduck.api.entity.model.jrebel;

import lombok.Data;

@Data
public class JrebelJsonBaseModel {
    private String serverVersion;
    private String serverProtocolVersion;
    private String serverGuid;
    private String groupType;
    private String statusCode;
    private String company;
}
