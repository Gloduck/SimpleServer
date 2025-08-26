package cn.gloduck.api.service.torrent.handler;

import java.io.*;
import java.nio.charset.*;
import java.net.http.*;
import java.util.zip.GZIPInputStream;
import java.net.URI;

public class StringBodyHandler implements HttpResponse.BodyHandler<String> {
    @Override
    public HttpResponse.BodySubscriber<String> apply(HttpResponse.ResponseInfo responseInfo) {
        String encoding = responseInfo.headers()
                .firstValue("Content-Encoding")
                .orElse("")
                .toLowerCase();

        Charset charset = responseInfo.headers().firstValue("Content-Type").map(StringBodyHandler::parseCharset)
                .orElse(Charset.defaultCharset());

        HttpResponse.BodySubscriber<byte[]> bodySubscriber = HttpResponse.BodySubscribers.ofByteArray();

        return HttpResponse.BodySubscribers.mapping(
                bodySubscriber,
                bytes -> {
                    if (encoding.contains("gzip")) {
                        try (ByteArrayInputStream bais = new ByteArrayInputStream(bytes);
                             GZIPInputStream gzis = new GZIPInputStream(bais);
                             ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                            byte[] buffer = new byte[4096];
                            int len;
                            while ((len = gzis.read(buffer)) > 0) {
                                baos.write(buffer, 0, len);
                            }
                            return baos.toString(charset);
                        } catch (IOException e) {
                            throw new UncheckedIOException("GZIP decompression failed", e);
                        }
                    } else {
                        return new String(bytes, charset);
                    }
                }
        );
    }

    private static Charset parseCharset(String contentType) {
        try {
            String[] parts = contentType.split(";");
            for (String part : parts) {
                if (part.trim().startsWith("charset=")) {
                    String charsetName = part.trim().substring(8);
                    return Charset.forName(charsetName);
                }
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }

}
