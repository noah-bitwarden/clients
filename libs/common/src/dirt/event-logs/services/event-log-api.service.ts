import { ApiService } from "../../../abstractions/api.service";
import { ListResponse } from "../../../models/response/list.response";
import { EventResponse } from "../models/response/event.response";

import { addEventParameters } from "./event-query-params.util";

export class EventLogApiService {
  constructor(private apiService: ApiService) {}

  async getEventsSend(
    orgId: string,
    id: string,
    start: string,
    end: string,
    token: string,
  ): Promise<ListResponse<EventResponse>> {
    const r = await this.apiService.send(
      "GET",
      addEventParameters("/organizations/" + orgId + "/sends/" + id + "/events", start, end, token),
      null,
      true,
      true,
    );
    return new ListResponse(r, EventResponse);
  }

  /**
   * Events from the provider's selected client organizations, merged newest first. The
   * continuation token is bound to the exact `organizationIds` set, so every page of one traversal
   * must send the same set. The ids are always sent explicitly rather than relying on the
   * server's no-filter default.
   */
  async getEventsProviderClients(
    providerId: string,
    organizationIds: string[],
    start: string | null,
    end: string | null,
    token: string | null,
  ): Promise<ListResponse<EventResponse>> {
    let path = addEventParameters("/providers/" + providerId + "/client-events", start, end, token);
    for (const organizationId of organizationIds) {
      path += path.indexOf("?") > -1 ? "&" : "?";
      path += "organizationId=" + encodeURIComponent(organizationId);
    }
    const r = await this.apiService.send("GET", path, null, true, true);
    return new ListResponse(r, EventResponse);
  }
}
