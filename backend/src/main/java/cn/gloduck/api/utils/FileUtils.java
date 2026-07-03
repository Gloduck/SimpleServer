package cn.gloduck.api.utils;

import java.net.URI;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;

public final class FileUtils {
    private FileUtils() {
    }

    public static Path applicationDirectory(Class<?> anchorClass) {
        try {
            URL location = anchorClass.getProtectionDomain().getCodeSource().getLocation();
            if (location != null) {
                Path path = Path.of(URI.create(location.toString())).toAbsolutePath().normalize();
                return Files.isRegularFile(path) ? path.getParent() : path;
            }
        } catch (Exception ignored) {
        }
        return Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
    }
}
