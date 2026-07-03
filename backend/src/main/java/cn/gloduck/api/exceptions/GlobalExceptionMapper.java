package cn.gloduck.api.exceptions;

import cn.gloduck.common.entity.base.Result;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

@Provider
public class GlobalExceptionMapper implements ExceptionMapper<Throwable> {
    @Override
    public Response toResponse(Throwable exception) {
        return Response.ok(Result.error(exception.getMessage()), MediaType.APPLICATION_JSON).build();
    }
}
