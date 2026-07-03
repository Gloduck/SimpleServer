package cn.gloduck.api.controller;

import cn.gloduck.api.service.requestProxy.RequestProxyService;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HEAD;
import jakarta.ws.rs.OPTIONS;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;

import java.io.InputStream;

@Path("/api/requestProxy")
public class RequestProxyController {
    private final RequestProxyService requestProxyService;

    public RequestProxyController(RequestProxyService requestProxyService) {
        this.requestProxyService = requestProxyService;
    }

    @GET
    @Path("{path:.*}")
    public Response get(@PathParam("path") String path, @Context HttpHeaders headers, @Context UriInfo uriInfo) {
        return requestProxyService.proxy("GET", path, null, headers, uriInfo);
    }

    @POST
    @Path("{path:.*}")
    public Response post(@PathParam("path") String path, InputStream body, @Context HttpHeaders headers, @Context UriInfo uriInfo) {
        return requestProxyService.proxy("POST", path, body, headers, uriInfo);
    }

    @PUT
    @Path("{path:.*}")
    public Response put(@PathParam("path") String path, InputStream body, @Context HttpHeaders headers, @Context UriInfo uriInfo) {
        return requestProxyService.proxy("PUT", path, body, headers, uriInfo);
    }

    @PATCH
    @Path("{path:.*}")
    public Response patch(@PathParam("path") String path, InputStream body, @Context HttpHeaders headers, @Context UriInfo uriInfo) {
        return requestProxyService.proxy("PATCH", path, body, headers, uriInfo);
    }

    @DELETE
    @Path("{path:.*}")
    public Response delete(@PathParam("path") String path, InputStream body, @Context HttpHeaders headers, @Context UriInfo uriInfo) {
        return requestProxyService.proxy("DELETE", path, body, headers, uriInfo);
    }

    @HEAD
    @Path("{path:.*}")
    public Response head(@PathParam("path") String path, @Context HttpHeaders headers, @Context UriInfo uriInfo) {
        return requestProxyService.proxy("HEAD", path, null, headers, uriInfo);
    }

    @OPTIONS
    @Path("{path:.*}")
    public Response options(@PathParam("path") String path, @Context HttpHeaders headers, @Context UriInfo uriInfo) {
        return requestProxyService.options(path, headers, uriInfo);
    }
}
