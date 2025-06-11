package cn.gloduck.api.service.jrebel;

import cn.gloduck.api.entity.config.JrebelConfig;
import cn.gloduck.api.entity.model.jrebel.JrebelJsonBaseModel;
import cn.gloduck.api.entity.model.jrebel.JrebelLeasesModel;
import cn.gloduck.api.entity.model.jrebel.JrebelLeasesV1Model;
import cn.gloduck.api.utils.ConfigUtils;
import lombok.NonNull;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.*;

public class JRebelService {
    private static final String CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    private static final Random RANDOM = new Random();

    private static final String JSON_SUCCESS_STATUS_CODE = "SUCCESS";
    private static final String LEASES_SIGN_PRIVATE_KEY = """
            -----BEGIN PRIVATE KEY-----
            MIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGBAND3cI/pKMSd4OLMIXU/8xoEZ/nz
            a+g00Vy7ygyGB1Nn83qpro7tckOvUVILJoN0pKw8J3E8rtjhSyr9849qzaQKBhxFL+J5uu08QVn/
            tMt+Tf0cu5MSPOjT8I2+NWyBZ6H0FjOcVrEUMvHt8sqoJDrDU4pJyex2rCOlpfBeqK6XAgMBAAEC
            gYBM5C+8FIxWxM1CRuCs1yop0aM82vBC0mSTXdo7/3lknGSAJz2/A+o+s50Vtlqmll4drkjJJw4j
            acsR974OcLtXzQrZ0G1ohCM55lC3kehNEbgQdBpagOHbsFa4miKnlYys537Wp+Q61mhGM1weXzos
            gCH/7e/FjJ5uS6DhQc0Y+QJBAP43hlSSEo1BbuanFfp55yK2Y503ti3Rgf1SbE+JbUvIIRsvB24x
            Ha1/IZ+ttkAuIbOUomLN7fyyEYLWphIy9kUCQQDSbqmxZaJNRa1o4ozGRORxR2KBqVn3EVISXqNc
            UH3gAP52U9LcnmA3NMSZs8tzXhUhYkWQ75Q6umXvvDm4XZ0rAkBoymyWGeyJy8oyS/fUW0G63mIr
            oZZ4Rp+F098P3j9ueJ2k/frbImXwabJrhwjUZe/Afel+PxL2ElUDkQW+BMHdAkEAk/U7W4Aanjpf
            s1+Xm9DUztFicciheRa0njXspvvxhY8tXAWUPYseG7L+iRPh+Twtn0t5nm7VynVFN0shSoCIAQJA
            Ljo7A6bzsvfnJpV+lQiOqD/WCw3A2yPwe+1d0X/13fQkgzcbB3K0K81Euo/fkKKiBv0A7yR7wvrN
            jzefE9sKUw==
            -----END PRIVATE KEY-----
            """;

    /**
     * 服务器签名
     */
    private final JrebelConfig config;

    public JrebelLeasesV1Model jrebelLeases1(String username) {
        JrebelLeasesV1Model leasesV1Model = JrebelLeasesV1Model.builder().build();
        fillJsonModelBaseInfo(username, leasesV1Model);
        return leasesV1Model;
    }

    public JrebelLeasesModel jrebelLeases(String username, String clientRandomness, Long clientTime, String guid, Boolean isOffline, Integer offlineDays) {
        Boolean offline = Optional.ofNullable(isOffline).orElse(false);
        String randomness = generateServerRandomness();
        // 构造签名参数
        List<String> signatureList = new ArrayList<>();
        signatureList.add(clientRandomness);
        signatureList.add(randomness);
        signatureList.add(guid);
        signatureList.add(String.valueOf(offline));
        // 计算有效时间
        long now = clientTime != null ? clientTime : System.currentTimeMillis();
        Long offlineFrom = null;
        Long offlineUntil = null;
        if (offline) {
            offlineFrom = now;
            // 需要添加的时间，如果是有设置的话，则走设置的时间，如果没有设置的话，则走许可传过来的时间
            Integer addOfflineDays = Optional.ofNullable(config.offlineDay).orElse(0) > 0 ? config.offlineDay : Optional.ofNullable(offlineDays).orElse(7);
            offlineUntil = now + (24L * 60 * 60 * 1000 * addOfflineDays);
            signatureList.add(offlineFrom.toString());
            signatureList.add(offlineUntil.toString());
        }
        Long licenseUntil = now + (config.licenseValidDays * 24 * 60 * 60 * 1000);

        // 构造返回值
        JrebelLeasesModel leasesModel = JrebelLeasesModel.builder()
                .id(1)
                .licenseType(1)
                .evaluationLicense(false)
                .signature(createLeasesSign(String.join(";", signatureList)))
                .serverRandomness(randomness)
                .seatPoolType("standalone")
                .offline(offline)
                .validFrom(offlineFrom)
                .validUntil(offlineUntil)
                .orderId("")
                .zeroIds(Collections.emptyList())
                .licenseValidFrom(now)
                .licenseValidUntil(licenseUntil)
                .licenseValidFrom(1490544001000L)
                .licenseValidUntil(1891839999000L)
                .build();
        fillJsonModelBaseInfo(username, leasesModel);
        return leasesModel;
    }

    /**
     * 创建租赁sign
     * content为;分隔的字符串
     *
     * @param content 内容
     * @return {@link String}
     */
    public String createLeasesSign(@NonNull String content) {
        String signData;
        try {
            byte[] keyBytes = Base64.getDecoder().decode(getFormatPrivateKey(LEASES_SIGN_PRIVATE_KEY));
            PKCS8EncodedKeySpec pkcs8EncodedKeySpec = new PKCS8EncodedKeySpec(keyBytes);
            KeyFactory keyFactory = KeyFactory.getInstance("RSA");
            Signature signature = Signature.getInstance("SHA1withRSA");
            signature.initSign(keyFactory.generatePrivate(pkcs8EncodedKeySpec));
            signature.update(content.getBytes(StandardCharsets.UTF_8));
            byte[] signed = signature.sign();
            signData = Base64.getEncoder().encodeToString(signed);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        return signData;
    }


    private String getFormatPrivateKey(String key) {
        return key.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace("\n", "");
    }

    /**
     * 填充json模型基础信息
     *
     * @param model 模型
     */
    private <T extends JrebelJsonBaseModel> void fillJsonModelBaseInfo(String username, T model) {

        String companyName = username != null ? username : config.companyName;
        model.setCompany(companyName);
        model.setServerGuid("a1b4aea8-b031-4302-b602-670a990272cb");
        model.setGroupType("managed");
        model.setServerVersion("3.2.4");
        model.setServerProtocolVersion("1.1");
        model.setStatusCode(JSON_SUCCESS_STATUS_CODE);
    }

    private static String generateServerRandomness() {
        return generateRandomString(11) + "=";
    }

    private static String generateRandomString(int length) {
        StringBuilder randomString = new StringBuilder(length);

        for (int i = 0; i < length; i++) {
            int index = RANDOM.nextInt(CHARACTERS.length());
            randomString.append(CHARACTERS.charAt(index));
        }

        return randomString.toString();
    }

    public JRebelService(JrebelConfig config) {
        this.config = config;
    }


    private static JRebelService instance;

    public static JRebelService instance() {
        if (instance == null) {
            JrebelConfig config = ConfigUtils.loadConfig("jrebel", JrebelConfig.class);
            instance = new JRebelService(config);
        }
        return instance;
    }
}
