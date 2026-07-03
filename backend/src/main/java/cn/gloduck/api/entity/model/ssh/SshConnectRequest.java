package cn.gloduck.api.entity.model.ssh;

public class SshConnectRequest {
    public String name;

    public String host;

    public Integer port = 22;

    public String username;

    public String authType;

    public String password;

    public String privateKey;

    public String passphrase;

    public Integer cols = 120;

    public Integer rows = 30;
}
