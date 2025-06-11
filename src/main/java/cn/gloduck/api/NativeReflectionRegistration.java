package cn.gloduck.api;

import io.github.classgraph.ClassGraph;
import io.github.classgraph.ClassInfo;
import io.github.classgraph.ScanResult;
import org.graalvm.nativeimage.hosted.Feature;
import org.graalvm.nativeimage.hosted.RuntimeReflection;

public class NativeReflectionRegistration implements Feature {
    @Override
    public void beforeAnalysis(BeforeAnalysisAccess access) {
        String[] scanPackages = {
                "cn.gloduck.common.entity",
                "cn.gloduck.api.entity",
                "cn.gloduck.api.controller"
        };

        try (ScanResult scan = new ClassGraph()
                .enableClassInfo()
                .acceptPackages(scanPackages)
                .scan()) {
            for (ClassInfo ci : scan.getAllClasses()) {
                Class<?> cls = ci.loadClass();
                registerClass(cls);
            }
        }

    }

    private void registerClass(Class<?> cls) {
        // 注册类本身
        RuntimeReflection.register(cls);
        // 注册所有 public 构造器、字段、方法
        RuntimeReflection.register(cls.getConstructors());
        RuntimeReflection.register(cls.getDeclaredFields());
        RuntimeReflection.register(cls.getDeclaredMethods());
    }
}