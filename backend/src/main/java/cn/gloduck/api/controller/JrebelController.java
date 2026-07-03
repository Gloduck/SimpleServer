package cn.gloduck.api.controller;

import cn.gloduck.api.entity.model.jrebel.JrebelLeasesModel;
import cn.gloduck.api.entity.model.jrebel.JrebelLeasesV1Model;
import cn.gloduck.api.service.jrebel.JRebelService;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;

@Path("/api/jrebel/jrebel")
@Produces(MediaType.APPLICATION_JSON)
public class JrebelController {
    private final JRebelService jRebelService;

    public JrebelController(JRebelService jRebelService) {
        this.jRebelService = jRebelService;
    }

    @POST
    @Path("/leases")
    public JrebelLeasesModel leasesHandler(@QueryParam("username") String username,
                                           @QueryParam("guid") String clientGuid,
                                           @QueryParam("randomness") String clientRandomness,
                                           @QueryParam("clientTime") Long clientTime,
                                           @QueryParam("offline") Boolean offline,
                                           @QueryParam("offlineDays") Integer offlineDays) {
        return jRebelService.jrebelLeases(username, clientRandomness, clientTime, clientGuid, offline, offlineDays);
    }

    @POST
    @Path("/leases/1")
    public JrebelLeasesV1Model leases1PostHandler(@QueryParam("username") String username) {
        return jRebelService.jrebelLeases1(username);
    }

    @DELETE
    @Path("/leases/1")
    public JrebelLeasesV1Model leases1DeleteHandler(@QueryParam("username") String username) {
        return jRebelService.jrebelLeases1(username);
    }
}
