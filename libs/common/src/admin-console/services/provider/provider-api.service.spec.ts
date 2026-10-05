import { mock } from "jest-mock-extended";

import { ApiService } from "../../../abstractions/api.service";
import { UpdateProviderClientAutoscaleRequest } from "../../models/request/update-provider-client-autoscale.request";

import { ProviderApiService } from "./provider-api.service";

describe("ProviderApiService", () => {
  const apiService = mock<ApiService>();
  const sut = new ProviderApiService(apiService);

  describe("updateProviderClientAutoscale", () => {
    it("sends the settings without logging the user out on 403", async () => {
      apiService.send.mockResolvedValue({ AutoscaleEnabled: true, AutoscaleSeatLimit: 25 });
      const request = new UpdateProviderClientAutoscaleRequest({ enabled: true, seatLimit: 25 });

      const response = await sut.updateProviderClientAutoscale(
        "provider-1",
        "provider-org-1",
        request,
      );

      expect(apiService.send).toHaveBeenCalledWith(
        "PUT",
        "/providers/provider-1/clients/provider-org-1/autoscale",
        request,
        true,
        true,
        undefined,
        undefined,
        { logoutOnForbidden: false },
      );
      expect(response.autoscaleEnabled).toBe(true);
      expect(response.autoscaleSeatLimit).toBe(25);
    });
  });
});
