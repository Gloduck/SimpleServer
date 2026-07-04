package cn.gloduck.api.entity.model.ssh;

public class SftpTransferResult {
    public String remotePath;

    public Long size;

    public String message;

    public SftpTransferResult() {
    }

    public SftpTransferResult(String remotePath, Long size, String message) {
        this.remotePath = remotePath;
        this.size = size;
        this.message = message;
    }
}
