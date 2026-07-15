package cn.gloduck.api;

import org.graalvm.nativeimage.hosted.Feature;
import org.graalvm.nativeimage.hosted.RuntimeReflection;
import org.graalvm.nativeimage.hosted.RuntimeResourceAccess;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.jar.JarFile;
import java.util.stream.Stream;

public class NativeReflectionRegistration implements Feature {
    @Override
    public void beforeAnalysis(BeforeAnalysisAccess access) {
        String[] scanPackages = {
                "cn.gloduck.common.entity",
                "cn.gloduck.api.entity"
        };

        for (String scanPackage : scanPackages) {
            registerPackageClasses(access, scanPackage);
        }

        String[] resourceDirs = {
                "META-INF/resources"
        };

        for (String resourceDir : resourceDirs) {
            registerResourceDirectory(resourceDir);
        }
    }

    private void registerPackageClasses(BeforeAnalysisAccess access, String packageName) {
        String packagePath = packageName.replace('.', '/') + "/";
        Set<String> classNames = new TreeSet<>();

        // Quarkus native 构建会隔离 hosted 与应用 classpath，直接扫描 GraalVM 提供的应用输入。
        for (Path classpathEntry : access.getApplicationClassPath()) {
            try {
                if (Files.isDirectory(classpathEntry)) {
                    Path packageDir = classpathEntry.resolve(packagePath);
                    if (!Files.isDirectory(packageDir)) {
                        continue;
                    }
                    try (Stream<Path> files = Files.walk(packageDir)) {
                        files.filter(Files::isRegularFile)
                                .map(classpathEntry::relativize)
                                .map(Path::toString)
                                .filter(path -> path.endsWith(".class"))
                                .map(path -> path.substring(0, path.length() - ".class".length())
                                        .replace('\\', '.')
                                        .replace('/', '.'))
                                .forEach(classNames::add);
                    }
                } else if (Files.isRegularFile(classpathEntry) && classpathEntry.toString().endsWith(".jar")) {
                    try (JarFile jar = new JarFile(classpathEntry.toFile())) {
                        jar.stream()
                                .map(entry -> entry.getName())
                                .filter(path -> path.startsWith(packagePath) && path.endsWith(".class"))
                                .map(path -> path.substring(0, path.length() - ".class".length())
                                        .replace('/', '.'))
                                .forEach(classNames::add);
                    }
                }
            } catch (IOException e) {
                throw new RuntimeException("Failed to scan application classpath: " + classpathEntry, e);
            }
        }

        int count = 0;
        for (String className : classNames) {
            if (className.endsWith("package-info") || className.endsWith("module-info")) {
                continue;
            }
            Class<?> cls = access.findClassByName(className);
            if (cls == null) {
                throw new IllegalStateException("Failed to load application class: " + className);
            }
            registerClass(cls);
            count++;
            System.out.println("[GraalVM] Registered class: " + cls.getName());
        }
        System.out.printf("[GraalVM] Registered %d classes from package: %s%n", count, packageName);
    }

    /**
     * 注册指定资源目录及其所有子文件
     *
     * @param resourceDir 资源目录路径，相对于 classpath 根目录
     */
    private void registerResourceDirectory(String resourceDir) {
        try {
            ClassLoader classLoader = getClass().getClassLoader();
            URL resourceUrl = classLoader.getResource(resourceDir);

            if (resourceUrl == null) {
                System.err.println("[GraalVM] Resource directory not found: " + resourceDir);
                return;
            }

            List<String> resourcePaths = new ArrayList<>();

            if ("jar".equals(resourceUrl.getProtocol())) {
                processJarResources(resourceUrl, resourceDir, resourcePaths);
            } else {
                processFileSystemResources(resourceUrl, resourceDir, resourcePaths);
            }

            // 注册所有收集到的资源
            for (String path : resourcePaths) {
                registerResource(path);
                System.out.println("[GraalVM] Registered resource: " + path);
            }

            System.out.printf("[GraalVM] Registered %d resources from directory: %s%n",
                    resourcePaths.size(), resourceDir);

        } catch (Exception e) {
            throw new RuntimeException("Failed to register resources for directory: " + resourceDir, e);
        }
    }

    /**
     * 处理 JAR 包中的资源
     */
    private void processJarResources(URL jarResourceUrl, String resourceDir, List<String> resourcePaths)
            throws URISyntaxException, IOException {
        String jarUriString = jarResourceUrl.toString();
        int separatorIndex = jarUriString.indexOf("!/");
        if (separatorIndex == -1) {
            throw new IOException("Invalid JAR URL: " + jarUriString);
        }

        URI jarUri = new URI(jarUriString.substring(0, separatorIndex));
        String internalPath = jarUriString.substring(separatorIndex + 2);

        try (FileSystem fs = FileSystems.newFileSystem(jarUri, Collections.emptyMap())) {
            Path resourceRoot = fs.getPath(internalPath);
            collectResourcePaths(resourceRoot, resourceDir, resourcePaths);
        }
    }

    /**
     * 处理文件系统中的资源
     */
    private void processFileSystemResources(URL fileResourceUrl, String resourceDir, List<String> resourcePaths)
            throws URISyntaxException, IOException {
        Path resourceRoot = Paths.get(fileResourceUrl.toURI());
        collectResourcePaths(resourceRoot, resourceDir, resourcePaths);
    }

    /**
     * 递归收集资源路径（核心方法）
     */
    private void collectResourcePaths(Path resourceRoot, String resourceDir, List<String> resourcePaths)
            throws IOException {
        Files.walkFileTree(resourceRoot, new SimpleFileVisitor<Path>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                // 计算相对路径并统一使用正斜杠
                String relativePath = resourceRoot.relativize(file)
                        .toString()
                        .replace('\\', '/');

                // 构建完整资源路径
                String fullResourcePath = resourceDir + "/" + relativePath;
                resourcePaths.add(fullResourcePath);

                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException exc) {
                System.err.println("[GraalVM] Failed to access file: " + file);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private static void registerClass(Class<?> cls) {
        // 注册类本身
        RuntimeReflection.register(cls);
        // 注册所有 public 构造器、字段、方法
        RuntimeReflection.register(cls.getConstructors());
        RuntimeReflection.register(cls.getDeclaredFields());
        RuntimeReflection.register(cls.getDeclaredMethods());
    }

    private static void registerResource(String filePath) {
        RuntimeResourceAccess.addResource(ClassLoader.getSystemClassLoader().getUnnamedModule(), filePath);
    }
}
