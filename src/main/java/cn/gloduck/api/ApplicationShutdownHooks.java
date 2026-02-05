package cn.gloduck.api;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 全局应用程序关闭钩子管理器
 * 提供静态方法来注册多个Runnable方法，在应用程序关闭时按顺序执行
 */
public class ApplicationShutdownHooks {

    // 使用CopyOnWriteArrayList保证线程安全，避免在遍历时修改导致的并发问题
    private static final List<Runnable> hooks = new CopyOnWriteArrayList<>();

    // 使用原子布尔值确保线程安全的状态管理
    private static final AtomicBoolean shutdownInProgress = new AtomicBoolean(false);
    private static final AtomicBoolean shutdownRegistered = new AtomicBoolean(false);

    /**
     * 私有构造方法，防止外部实例化
     */
    private ApplicationShutdownHooks() {
        // 工具类，不允许实例化
        throw new AssertionError("Cannot instantiate ApplicationShutdownHooks");
    }

    /**
     * 注册一个在应用程序关闭时执行的Runnable
     * @param hook 要执行的Runnable
     * @throws IllegalStateException 如果关闭过程已经开始
     * @throws NullPointerException 如果hook为null
     */
    public static void addShutdownHook(Runnable hook) {
        if (hook == null) {
            throw new NullPointerException("Hook cannot be null");
        }

        if (shutdownInProgress.get()) {
            throw new IllegalStateException("Shutdown in progress, cannot add new hooks");
        }

        hooks.add(hook);
    }

    /**
     * 移除一个已注册的关闭钩子
     * @param hook 要移除的Runnable
     * @return 如果成功移除返回true
     */
    public static boolean removeShutdownHook(Runnable hook) {
        if (shutdownInProgress.get()) {
            return false;
        }

        return hooks.remove(hook);
    }

    /**
     * 获取已注册的关闭钩子数量
     */
    public static int getHookCount() {
        return hooks.size();
    }

    /**
     * 手动触发关闭钩子执行（用于测试或特殊情况）
     * 注意：此方法只应在应用程序明确要关闭时调用
     */
    public static void shutdown() {
        if (shutdownInProgress.compareAndSet(false, true)) {
            executeHooks();
        }
    }

    /**
     * 清空所有已注册的关闭钩子
     */
    public static void clearAllHooks() {
        if (!shutdownInProgress.get()) {
            hooks.clear();
        }
    }

    /**
     * 注册JVM关闭钩子
     */
    public static void registerShutdownHook() {
        if (shutdownRegistered.compareAndSet(false, true)) {
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                shutdownInProgress.set(true);
                executeHooks();
            }, "ApplicationShutdownHooks-Thread"));
        }
    }

    /**
     * 执行所有注册的钩子
     */
    private static void executeHooks() {
        if (hooks.isEmpty()) {
            return;
        }

        System.out.println("Starting application shutdown...");
        System.out.println("Executing " + hooks.size() + " shutdown hooks");

        int executedCount = 0;
        int failedCount = 0;

        // 按添加顺序执行钩子
        for (Runnable hook : hooks) {
            try {
                hook.run();
                executedCount++;
            } catch (Throwable t) {
                failedCount++;
                System.err.println("Shutdown hook failed: " + t.getMessage());
                t.printStackTrace();
                // 继续执行其他钩子，不因为一个失败而停止
            }
        }

        System.out.println("Shutdown completed. Successfully executed: " +
                executedCount + ", Failed: " + failedCount);
    }

    /**
     * 添加多个关闭钩子（批量操作）
     * @param hooksToAdd 要添加的关闭钩子数组
     */
    public static void addShutdownHooks(Runnable... hooksToAdd) {
        if (hooksToAdd == null) {
            return;
        }

        for (Runnable hook : hooksToAdd) {
            if (hook != null) {
                addShutdownHook(hook);
            }
        }
    }
}