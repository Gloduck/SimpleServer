package cn.gloduck.api.utils;

import cn.gloduck.api.service.torrent.handler.AbstractTorrentHandler;
import cn.gloduck.common.entity.base.Pair;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.logging.Logger;

public class UnitUtils {
    private final static Logger LOGGER = Logger.getLogger(AbstractTorrentHandler.class.getName());

    private static final List<Pair<String, Long>> UNIT_MAP = new ArrayList<>();

    static {
        UNIT_MAP.add(new Pair<>("pib", 1024L * 1024 * 1024 * 1024 * 1024));
        UNIT_MAP.add(new Pair<>("tib", 1024L * 1024 * 1024 * 1024));
        UNIT_MAP.add(new Pair<>("gib", 1024L * 1024 * 1024));
        UNIT_MAP.add(new Pair<>("mib", 1024L * 1024));
        UNIT_MAP.add(new Pair<>("kib", 1024L));
        UNIT_MAP.add(new Pair<>("bytes", 1L));
        UNIT_MAP.add(new Pair<>("pb", 1024L * 1024 * 1024 * 1024 * 1024));
        UNIT_MAP.add(new Pair<>("tb", 1024L * 1024 * 1024 * 1024));
        UNIT_MAP.add(new Pair<>("gb", 1024L * 1024 * 1024));
        UNIT_MAP.add(new Pair<>("mb", 1024L * 1024));
        UNIT_MAP.add(new Pair<>("kb", 1024L));
        UNIT_MAP.add(new Pair<>("b", 1L));
        UNIT_MAP.sort((pair1, pair2) -> {
            String unit1 = pair1.getKey();
            String unit2 = pair2.getKey();
            // 先比较长度：长度大的排在前面
            int lengthCompare = Integer.compare(unit2.length(), unit1.length());
            // 长度相同，按字符串自然排序兜底
            return lengthCompare != 0 ? lengthCompare : unit1.compareTo(unit2);
        });
    }

    public static Long convertSizeUnit(String sizeStr) {
        if (sizeStr == null) {
            return null;
        }
        sizeStr = sizeStr.trim().replace(" ", "").toLowerCase();
        for (Pair<String, Long> kv : UNIT_MAP) {
            if (sizeStr.endsWith(kv.getKey())) {
                return Math.round(Double.parseDouble(sizeStr.replace(kv.getKey(), "")) * kv.getValue());
            }
        }
        String numericStr = sizeStr.replaceAll("[^-+0-9.]", "");
        if (numericStr.indexOf('.') != numericStr.lastIndexOf('.')) {
            numericStr = numericStr.substring(0, numericStr.lastIndexOf('.'));
        }
        if (!Objects.equals(numericStr, sizeStr)) {
            LOGGER.warning(String.format("Exist Unresolved units: %s", sizeStr));
        }
        if (numericStr.isEmpty() || "-".equals(numericStr) || "+".equals(numericStr)) {
            return null;
        }
        return Math.round(Double.parseDouble(numericStr));
    }
}
