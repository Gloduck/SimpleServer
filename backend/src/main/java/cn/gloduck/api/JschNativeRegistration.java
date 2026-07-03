package cn.gloduck.api;

import org.graalvm.nativeimage.hosted.Feature;
import org.graalvm.nativeimage.hosted.RuntimeClassInitialization;
import org.graalvm.nativeimage.hosted.RuntimeReflection;

public class JschNativeRegistration implements Feature {
    // 用户认证方式，JSch 会根据 PreferredAuthentications 通过类名加载。
    private static final String[] USER_AUTH_CLASSES = {
            "com.jcraft.jsch.UserAuthNone",
            "com.jcraft.jsch.UserAuthPassword",
            "com.jcraft.jsch.UserAuthKeyboardInteractive",
            "com.jcraft.jsch.UserAuthPublicKey",
            "com.jcraft.jsch.UserAuthGSSAPIWithMIC"
    };

    // SSH 密钥交换算法封装类，用于会话协商阶段。
    private static final String[] KEY_EXCHANGE_CLASSES = {
            "com.jcraft.jsch.DHG14",
            "com.jcraft.jsch.DHG15",
            "com.jcraft.jsch.DHG16",
            "com.jcraft.jsch.DHG17",
            "com.jcraft.jsch.DHG18",
            "com.jcraft.jsch.DHGEX256",
            "com.jcraft.jsch.DHEC256",
            "com.jcraft.jsch.DHEC384",
            "com.jcraft.jsch.DHEC521",
            "com.jcraft.jsch.DH25519",
            "com.jcraft.jsch.DH448"
    };

    // 上面密钥交换算法依赖的 JCE 实现类。
    private static final String[] KEY_EXCHANGE_IMPLEMENTATION_CLASSES = {
            "com.jcraft.jsch.jce.Random",
            "com.jcraft.jsch.jce.DH",
            "com.jcraft.jsch.jce.ECDH256",
            "com.jcraft.jsch.jce.ECDH384",
            "com.jcraft.jsch.jce.ECDH521",
            "com.jcraft.jsch.jce.XDH"
    };

    // SSH 传输层协商使用的对称加密算法。
    private static final String[] CIPHER_CLASSES = {
            "com.jcraft.jsch.jce.AES128CBC",
            "com.jcraft.jsch.jce.AES192CBC",
            "com.jcraft.jsch.jce.AES256CBC",
            "com.jcraft.jsch.jce.AES128CTR",
            "com.jcraft.jsch.jce.AES192CTR",
            "com.jcraft.jsch.jce.AES256CTR",
            "com.jcraft.jsch.jce.AES128GCM",
            "com.jcraft.jsch.jce.AES256GCM",
            "com.jcraft.jsch.jce.TripleDESCBC",
            "com.jcraft.jsch.jce.TripleDESCTR",
            "com.jcraft.jsch.jce.BlowfishCBC",
            "com.jcraft.jsch.jce.BlowfishCTR"
    };

    // SSH 传输层协商使用的消息认证码，用于完整性校验。
    private static final String[] MAC_CLASSES = {
            "com.jcraft.jsch.jce.HMACSHA1",
            "com.jcraft.jsch.jce.HMACSHA196",
            "com.jcraft.jsch.jce.HMACSHA1ETM",
            "com.jcraft.jsch.jce.HMACSHA196ETM",
            "com.jcraft.jsch.jce.HMACSHA256",
            "com.jcraft.jsch.jce.HMACSHA256ETM",
            "com.jcraft.jsch.jce.HMACSHA512",
            "com.jcraft.jsch.jce.HMACSHA512ETM"
    };

    // 指纹、密钥交换、签名等流程使用的哈希算法。
    private static final String[] HASH_CLASSES = {
            "com.jcraft.jsch.jce.MD5",
            "com.jcraft.jsch.jce.SHA1",
            "com.jcraft.jsch.jce.SHA256",
            "com.jcraft.jsch.jce.SHA384",
            "com.jcraft.jsch.jce.SHA512"
    };

    // 解析或处理私钥时使用的密钥对生成器。
    private static final String[] KEY_PAIR_GENERATOR_CLASSES = {
            "com.jcraft.jsch.jce.KeyPairGenDSA",
            "com.jcraft.jsch.jce.KeyPairGenRSA",
            "com.jcraft.jsch.jce.KeyPairGenECDSA",
            "com.jcraft.jsch.jce.KeyPairGenEdDSA"
    };

    // 主机密钥校验和公钥认证使用的签名算法实现。
    private static final String[] SIGNATURE_CLASSES = {
            "com.jcraft.jsch.jce.SignatureDSA",
            "com.jcraft.jsch.jce.SignatureRSA",
            "com.jcraft.jsch.jce.SignatureRSASHA256",
            "com.jcraft.jsch.jce.SignatureRSASHA512",
            "com.jcraft.jsch.jce.SignatureECDSA256",
            "com.jcraft.jsch.jce.SignatureECDSA384",
            "com.jcraft.jsch.jce.SignatureECDSA521",
            "com.jcraft.jsch.jce.SignatureEd25519",
            "com.jcraft.jsch.jce.SignatureEd448",
            "com.jcraft.jsch.jce.SignatureEdDSA"
    };

    // 加密 OpenSSH 私钥所需的 KDF 实现。
    private static final String[] PRIVATE_KEY_KDF_CLASSES = {
            "com.jcraft.jsch.jce.PBKDF2",
            "com.jcraft.jsch.jbcrypt.BCrypt",
            "com.jcraft.jsch.jbcrypt.JBCrypt"
    };

    // 启用 zlib 时可选的 SSH 压缩实现。
    private static final String[] COMPRESSION_CLASSES = {
            "com.jcraft.jsch.juz.Compression",
            "com.jcraft.jsch.jzlib.Compression"
    };

    // 可选的 Kerberos/GSSAPI 认证支持。
    private static final String[] GSSAPI_CLASSES = {
            "com.jcraft.jsch.jgss.GSSContextKrb5"
    };

    private static final String[][] REFLECTIVE_CLASS_GROUPS = {
            USER_AUTH_CLASSES,
            KEY_EXCHANGE_CLASSES,
            KEY_EXCHANGE_IMPLEMENTATION_CLASSES,
            CIPHER_CLASSES,
            MAC_CLASSES,
            HASH_CLASSES,
            KEY_PAIR_GENERATOR_CLASSES,
            SIGNATURE_CLASSES,
            PRIVATE_KEY_KDF_CLASSES,
            COMPRESSION_CLASSES,
            GSSAPI_CLASSES
    };

    @Override
    public void beforeAnalysis(BeforeAnalysisAccess access) {
        RuntimeClassInitialization.initializeAtRunTime("com.jcraft.jsch.PortWatcher");
        for (String[] classGroup : REFLECTIVE_CLASS_GROUPS) {
            for (String className : classGroup) {
                register(className);
            }
        }
    }

    private void register(String className) {
        try {
            Class<?> cls = Class.forName(className, false, Thread.currentThread().getContextClassLoader());
            RuntimeReflection.register(cls);
            RuntimeReflection.register(cls.getDeclaredConstructors());
            RuntimeReflection.register(cls.getDeclaredMethods());
            RuntimeReflection.register(cls.getDeclaredFields());
            System.out.println("[GraalVM] Registered JSch class: " + className);
        } catch (ClassNotFoundException | LinkageError e) {
            System.out.println("[GraalVM] Skipped optional JSch class: " + className);
        }
    }
}
