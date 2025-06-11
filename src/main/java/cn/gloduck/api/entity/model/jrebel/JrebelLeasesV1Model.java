package cn.gloduck.api.entity.model.jrebel;

import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;

@EqualsAndHashCode(callSuper = true)
@Data
@Builder
public class JrebelLeasesV1Model extends JrebelJsonBaseModel {
    private String msg;
    private String statusMessage;
}