package cn.gloduck.common.entity.base;

import lombok.Data;

import java.util.List;

@Data
public class ScrollPageResult<T> {
    private Long index;

    private Boolean hasNext;

    private List<T> items;

    public ScrollPageResult(Long index, Boolean hasNext, List<T> items) {
        this.index = index;
        this.hasNext = hasNext;
        this.items = items;
    }
}
