package cn.gloduck.api.utils;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.security.KeyManagementException;
import java.security.NoSuchAlgorithmException;
import java.security.cert.X509Certificate;
import java.util.Optional;

public class HttpClientUtils {
    public static HttpClient buildClient(Integer connectTimeout, String proxy, boolean trustAllCertificates) {
        HttpClient.Builder builder = HttpClient.newBuilder();
        Integer timeout = Optional.ofNullable(connectTimeout).orElse(5);
        builder.connectTimeout(java.time.Duration.ofSeconds(timeout));
        InetSocketAddress proxyAddress = NetUtils.buildProxyAddress(proxy);
        if (proxyAddress != null) {
            builder.proxy(java.net.ProxySelector.of(proxyAddress));
        }

        if (trustAllCertificates) {
            SSLContext sslContext;
            try {
                sslContext = SSLContext.getInstance("TLS");
                sslContext.init(null, new TrustManager[]{
                        new X509TrustManager() {
                            @Override
                            public X509Certificate[] getAcceptedIssuers() {
                                return null;
                            }

                            @Override
                            public void checkClientTrusted(X509Certificate[] certs, String authType) {
                            }

                            @Override
                            public void checkServerTrusted(X509Certificate[] certs, String authType) {
                            }
                        }
                }, new java.security.SecureRandom());
                builder.sslContext(sslContext);
            } catch (NoSuchAlgorithmException | KeyManagementException e) {
                throw new RuntimeException(e);
            }
        }
        return builder.build();
    }
}
