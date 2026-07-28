package cn.gloduck.api.exceptions;

import cn.gloduck.common.entity.base.Result;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;
import org.jboss.logging.Logger;

@Provider
public class GlobalExceptionMapper implements ExceptionMapper<Throwable> {
    private static final Logger LOG = Logger.getLogger(GlobalExceptionMapper.class);

    @Override
    public Response toResponse(Throwable exception) {
        LOG.error("Unhandled request error", exception);
        return Response.ok(Result.error(exception.getMessage()), MediaType.APPLICATION_JSON).build();
    }
}
