package cn.gloduck.api.service.ssh;

import cn.gloduck.api.entity.config.SshConfig;
import cn.gloduck.api.entity.model.ssh.SshConnectRequest;
import cn.gloduck.api.entity.model.ssh.SshConnectionInfo;
import cn.gloduck.api.exceptions.ApiException;
import cn.gloduck.api.utils.StringUtils;
import com.jcraft.jsch.ChannelShell;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.UIKeyboardInteractive;
import com.jcraft.jsch.UserInfo;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

@ApplicationScoped
public class SshService {
    private static final int DEFAULT_MAX_CONNECTIONS = 10;
    private static final int DEFAULT_HEARTBEAT_TIMEOUT_SECONDS = 60;
    private static final int CONNECT_TIMEOUT_MILLIS = 10_000;

    private final SshConfig sshConfig;
    private final Map<String, SshConnection> connections = new ConcurrentHashMap<>();
    private final Object connectionLimitLock = new Object();
    private ScheduledExecutorService cleanupExecutor;

    public SshService(SshConfig sshConfig) {
        this.sshConfig = sshConfig;
    }

    public void verify(String securityKey) {
        String configuredSecurityKey = sshConfig == null ? null : sshConfig.securityKey;
        if (StringUtils.isNullOrEmpty(configuredSecurityKey)) {
            return;
        }
        if (!configuredSecurityKey.equals(securityKey)) {
            throw new ApiException("Invalid ssh security key");
        }
    }

    @PostConstruct
    void init() {
        applyJschConfig();
        cleanupExecutor = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread thread = new Thread(r, "ssh-heartbeat-cleaner");
            thread.setDaemon(true);
            return thread;
        });
        cleanupExecutor.scheduleWithFixedDelay(this::cleanupConnections, 5, 5, TimeUnit.SECONDS);
    }

    @PreDestroy
    void destroy() {
        if (cleanupExecutor != null) {
            cleanupExecutor.shutdownNow();
        }
        for (String connectionId : connections.keySet()) {
            close(connectionId);
        }
    }

    public SshConnectionInfo connect(SshConnectRequest request, BiConsumer<String, String> outputConsumer, Consumer<String> closeCallback) {
        validate(request);
        ensureConnectionCapacity();

        String id = UUID.randomUUID().toString();
        com.jcraft.jsch.Session sshSession = null;
        ChannelShell channel = null;
        try {
            JSch jsch = new JSch();
            boolean privateKeyAuth = isPrivateKeyAuth(request.authType);
            if (privateKeyAuth) {
                byte[] keyBytes = request.privateKey.getBytes(StandardCharsets.UTF_8);
                byte[] passphraseBytes = StringUtils.isNullOrEmpty(request.passphrase) ? null : request.passphrase.getBytes(StandardCharsets.UTF_8);
                jsch.addIdentity("ssh-key-" + id, keyBytes, null, passphraseBytes);
            }

            int port = request.port == null ? 22 : request.port;
            sshSession = jsch.getSession(request.username, request.host, port);
            sshSession.setConfig(sessionConfig(privateKeyAuth));
            if (!privateKeyAuth) {
                sshSession.setPassword(request.password);
            }
            sshSession.setUserInfo(new PasswordUserInfo(request.password, request.passphrase));
            sshSession.connect(CONNECT_TIMEOUT_MILLIS);

            channel = (ChannelShell) sshSession.openChannel("shell");
            channel.setPty(true);
            channel.setPtyType("xterm-256color");
            if (validSize(request.cols, request.rows)) {
                channel.setPtySize(request.cols, request.rows, request.cols * 8, request.rows * 16);
            }

            SshConnection connection = new SshConnection(
                    id,
                    request.name,
                    request.host,
                    port,
                    request.username,
                    sshSession,
                    channel,
                    closeCallback
            );
            OutputStream sshOutput = new ForwardingOutputStream(data -> {
                connection.markOutput();
                if (outputConsumer != null) {
                    outputConsumer.accept(id, data);
                }
            });
            channel.setOutputStream(sshOutput, true);
            channel.setExtOutputStream(sshOutput, true);
            connection.setInputStream(channel.getOutputStream());
            channel.connect(CONNECT_TIMEOUT_MILLIS);
            putConnection(connection);
            return connection.info();
        } catch (ApiException e) {
            if (channel != null) {
                channel.disconnect();
            }
            if (sshSession != null) {
                sshSession.disconnect();
            }
            throw e;
        } catch (Exception e) {
            if (channel != null) {
                channel.disconnect();
            }
            if (sshSession != null) {
                sshSession.disconnect();
            }
            throw new ApiException("SSH connect failed: " + rootMessage(e), e);
        }
    }

    public void heartbeat(String connectionId) {
        connection(connectionId).heartbeat();
    }

    public void input(String connectionId, String data) {
        SshConnection connection = connection(connectionId);
        connection.write(data);
    }

    public void resize(String connectionId, Integer cols, Integer rows) {
        connection(connectionId).resize(cols, rows);
    }

    public void close(String connectionId) {
        if (connectionId == null) {
            return;
        }
        SshConnection connection = connections.remove(connectionId);
        if (connection != null) {
            connection.close();
        }
    }

    private void putConnection(SshConnection connection) {
        synchronized (connectionLimitLock) {
            ensureConnectionCapacityLocked();
            connections.put(connection.id(), connection);
        }
    }

    private void ensureConnectionCapacity() {
        synchronized (connectionLimitLock) {
            ensureConnectionCapacityLocked();
        }
    }

    private void ensureConnectionCapacityLocked() {
        cleanupConnections();
        int maxConnections = maxConnections();
        if (maxConnections > 0 && connections.size() >= maxConnections) {
            throw new ApiException("SSH connection limit exceeded");
        }
    }

    private void cleanupConnections() {
        long timeoutMillis = heartbeatTimeoutMillis();
        for (Map.Entry<String, SshConnection> entry : connections.entrySet()) {
            SshConnection connection = entry.getValue();
            if (connection == null || !connection.isConnected()) {
                if (connections.remove(entry.getKey(), connection) && connection != null) {
                    connection.close();
                    connection.notifyClosed("SSH connection disconnected");
                }
            } else if (timeoutMillis > 0 && connection.isHeartbeatTimedOut(timeoutMillis) && connections.remove(entry.getKey(), connection)) {
                connection.close();
                connection.notifyClosed("SSH heartbeat timeout");
            }
        }
    }

    private SshConnection connection(String connectionId) {
        if (StringUtils.isNullOrEmpty(connectionId)) {
            throw new ApiException("connectionId is required");
        }
        SshConnection connection = connections.get(connectionId);
        if (connection == null || !connection.isConnected()) {
            connections.remove(connectionId);
            throw new ApiException("SSH connection is not available");
        }
        return connection;
    }

    private void validate(SshConnectRequest request) {
        if (request == null) {
            throw new ApiException("connect request is required");
        }
        if (StringUtils.isNullOrEmpty(request.host)) {
            throw new ApiException("host is required");
        }
        if (StringUtils.isNullOrEmpty(request.username)) {
            throw new ApiException("username is required");
        }
        if (request.port != null && (request.port <= 0 || request.port > 65535)) {
            throw new ApiException("port is invalid");
        }
        if (isPrivateKeyAuth(request.authType)) {
            if (StringUtils.isNullOrEmpty(request.privateKey)) {
                throw new ApiException("privateKey is required");
            }
        } else if (StringUtils.isNullOrEmpty(request.password)) {
            throw new ApiException("password is required");
        }
    }

    private Properties sessionConfig(boolean privateKeyAuth) {
        Properties properties = new Properties();
        properties.put("StrictHostKeyChecking", "no");
        properties.put("ServerAliveInterval", "30000");
        properties.put("ServerAliveCountMax", "3");
        properties.put("PreferredAuthentications", privateKeyAuth ? "publickey,password,keyboard-interactive" : "password,keyboard-interactive");
        return properties;
    }

    private void applyJschConfig() {
        String kex = String.join(",",
                "curve25519-sha256",
                "curve25519-sha256@libssh.org",
                "ecdh-sha2-nistp256",
                "ecdh-sha2-nistp384",
                "ecdh-sha2-nistp521",
                "diffie-hellman-group-exchange-sha256",
                "diffie-hellman-group16-sha512",
                "diffie-hellman-group18-sha512",
                "diffie-hellman-group14-sha256"
        );
        String hostKeys = String.join(",",
                "ssh-ed25519",
                "ssh-ed448",
                "ecdsa-sha2-nistp256",
                "ecdsa-sha2-nistp384",
                "ecdsa-sha2-nistp521",
                "rsa-sha2-512",
                "rsa-sha2-256"
        );
        String ciphers = String.join(",",
                "aes128-ctr",
                "aes192-ctr",
                "aes256-ctr",
                "aes128-gcm@openssh.com",
                "aes256-gcm@openssh.com"
        );
        String macs = String.join(",",
                "hmac-sha2-256",
                "hmac-sha2-512",
                "hmac-sha2-256-etm@openssh.com",
                "hmac-sha2-512-etm@openssh.com",
                "hmac-sha1",
                "hmac-sha1-etm@openssh.com"
        );

        JSch.setConfig("kex", kex);
        JSch.setConfig("server_host_key", hostKeys);
        JSch.setConfig("PubkeyAcceptedAlgorithms", hostKeys);
        JSch.setConfig("cipher.c2s", ciphers);
        JSch.setConfig("cipher.s2c", ciphers);
        JSch.setConfig("mac.c2s", macs);
        JSch.setConfig("mac.s2c", macs);
        JSch.setConfig("compression.c2s", "none,zlib@openssh.com,zlib");
        JSch.setConfig("compression.s2c", "none,zlib@openssh.com,zlib");
    }

    private int maxConnections() {
        Integer value = sshConfig == null ? null : sshConfig.maxConnections;
        return value == null ? DEFAULT_MAX_CONNECTIONS : value;
    }

    private long heartbeatTimeoutMillis() {
        Integer value = sshConfig == null ? null : sshConfig.heartbeatTimeoutSeconds;
        int seconds = value == null ? DEFAULT_HEARTBEAT_TIMEOUT_SECONDS : value;
        return seconds <= 0 ? 0 : seconds * 1000L;
    }

    private boolean validSize(Integer cols, Integer rows) {
        return cols != null && rows != null && cols > 0 && rows > 0;
    }

    private boolean isPrivateKeyAuth(String authType) {
        return "privateKey".equalsIgnoreCase(authType) || "key".equalsIgnoreCase(authType) || "sshKey".equalsIgnoreCase(authType);
    }

    private String rootMessage(Exception e) {
        Throwable cur = e;
        while (cur.getCause() != null && cur.getCause() != cur) {
            cur = cur.getCause();
        }
        String message = cur.getMessage();
        return StringUtils.isNullOrEmpty(message) ? cur.getClass().getSimpleName() : message;
    }

    private static class ForwardingOutputStream extends OutputStream {
        private final Consumer<String> consumer;

        private ForwardingOutputStream(Consumer<String> consumer) {
            this.consumer = consumer;
        }

        @Override
        public void write(int b) {
            consumer.accept(new String(new byte[]{(byte) b}, StandardCharsets.UTF_8));
        }

        @Override
        public void write(byte[] b, int off, int len) {
            consumer.accept(new String(b, off, len, StandardCharsets.UTF_8));
        }
    }

    private static class PasswordUserInfo implements UserInfo, UIKeyboardInteractive {
        private final String password;
        private final String passphrase;

        private PasswordUserInfo(String password, String passphrase) {
            this.password = password;
            this.passphrase = passphrase;
        }

        @Override
        public String getPassphrase() {
            return passphrase;
        }

        @Override
        public String getPassword() {
            return password;
        }

        @Override
        public boolean promptPassword(String message) {
            return password != null;
        }

        @Override
        public boolean promptPassphrase(String message) {
            return passphrase != null;
        }

        @Override
        public boolean promptYesNo(String message) {
            return true;
        }

        @Override
        public void showMessage(String message) {
        }

        @Override
        public String[] promptKeyboardInteractive(String destination, String name, String instruction, String[] prompt, boolean[] echo) {
            if (password == null || prompt == null) {
                return null;
            }
            String[] values = new String[prompt.length];
            for (int i = 0; i < values.length; i++) {
                values[i] = password;
            }
            return values;
        }
    }
}
