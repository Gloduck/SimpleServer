package cn.gloduck.common.entity.base;

/**
 * 列表项
 *
 * @author Gloduck
 * @date 2021/12/17
 */
public class Pair<K, V> {

    /**
     * key
     */
    private final K key;

    /**
     * value
     */
    private final V value;

    public Pair(K key, V value) {
        this.key = key;
        this.value = value;
    }

    public K getKey() {
        return key;
    }

    public V getValue() {
        return value;
    }

    @Override
    public String toString() {
        return "Pair{" +
                "key=" + key +
                ", value=" + value +
                '}';
    }
}
