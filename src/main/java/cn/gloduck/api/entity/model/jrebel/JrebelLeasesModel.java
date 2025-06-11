package cn.gloduck.api.entity.model.jrebel;

import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

@EqualsAndHashCode(callSuper = true)
@Data
@Builder
public class JrebelLeasesModel extends JrebelJsonBaseModel {
    private Integer id;
    private Integer licenseType;
    private Boolean evaluationLicense;
    private String signature;
    private String serverRandomness;
    private String seatPoolType;
    private Boolean offline;
    private Long validFrom;
    private Long validUntil;
    private String orderId;
    private List<Integer> zeroIds;
    private Long licenseValidFrom;
    private Long licenseValidUntil;
}
