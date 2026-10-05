import { ApiService } from "../../../abstractions/api.service";
import { ListResponse } from "../../../models/response/list.response";
import { ProviderApiServiceAbstraction } from "../../abstractions/provider/provider-api.service.abstraction";
import { CreateProviderOrganizationRequest } from "../../models/request/create-provider-organization.request";
import { ProviderSetupRequest } from "../../models/request/provider/provider-setup.request";
import { ProviderUpdateRequest } from "../../models/request/provider/provider-update.request";
import { ProviderVerifyRecoverDeleteRequest } from "../../models/request/provider/provider-verify-recover-delete.request";
import { UpdateProviderClientAutoscaleRequest } from "../../models/request/update-provider-client-autoscale.request";
import { UpdateProviderOrganizationRequest } from "../../models/request/update-provider-organization.request";
import { AddableOrganizationResponse } from "../../models/response/addable-organization.response";
import { ProviderClientAutoscaleResponse } from "../../models/response/provider/provider-client-autoscale.response";
import { ProviderOrganizationOrganizationDetailsResponse } from "../../models/response/provider/provider-organization.response";
import { ProviderResponse } from "../../models/response/provider/provider.response";

export class ProviderApiService implements ProviderApiServiceAbstraction {
  constructor(private apiService: ApiService) {}
  async postProviderSetup(id: string, request: ProviderSetupRequest) {
    const r = await this.apiService.send(
      "POST",
      "/providers/" + id + "/setup",
      request,
      true,
      true,
    );
    return new ProviderResponse(r);
  }

  async getProvider(id: string) {
    const r = await this.apiService.send("GET", "/providers/" + id, null, true, true);
    return new ProviderResponse(r);
  }

  async putProvider(id: string, request: ProviderUpdateRequest) {
    const r = await this.apiService.send("PUT", "/providers/" + id, request, true, true);
    return new ProviderResponse(r);
  }

  providerRecoverDeleteToken(
    providerId: string,
    request: ProviderVerifyRecoverDeleteRequest,
  ): Promise<any> {
    return this.apiService.send(
      "POST",
      "/providers/" + providerId + "/delete-recover-token",
      request,
      false,
      false,
    );
  }

  async deleteProvider(id: string): Promise<void> {
    await this.apiService.send("DELETE", "/providers/" + id, null, true, false);
  }

  async getProviderOrganizations(
    providerId: string,
  ): Promise<ListResponse<ProviderOrganizationOrganizationDetailsResponse>> {
    const response = await this.apiService.send(
      "GET",
      "/providers/" + providerId + "/organizations",
      null,
      true,
      true,
    );
    return new ListResponse(response, ProviderOrganizationOrganizationDetailsResponse);
  }

  async getProviderAddableOrganizations(
    providerId: string,
  ): Promise<AddableOrganizationResponse[]> {
    const response = await this.apiService.send(
      "GET",
      "/providers/" + providerId + "/clients/addable",
      null,
      true,
      true,
    );

    return response.map((data: any) => new AddableOrganizationResponse(data));
  }

  addOrganizationToProvider(
    providerId: string,
    request: {
      key: string;
      organizationId: string;
    },
  ): Promise<void> {
    return this.apiService.send(
      "POST",
      "/providers/" + providerId + "/clients/existing",
      request,
      true,
      false,
    );
  }

  async updateProviderOrganization(
    providerId: string,
    organizationId: string,
    request: UpdateProviderOrganizationRequest,
  ): Promise<any> {
    return await this.apiService.send(
      "PUT",
      "/providers/" + providerId + "/clients/" + organizationId,
      request,
      true,
      false,
    );
  }

  async updateProviderClientAutoscale(
    providerId: string,
    providerOrganizationId: string,
    request: UpdateProviderClientAutoscaleRequest,
  ): Promise<ProviderClientAutoscaleResponse> {
    const response = await this.apiService.send(
      "PUT",
      "/providers/" + providerId + "/clients/" + providerOrganizationId + "/autoscale",
      request,
      true,
      true,
      undefined,
      undefined,
      // The endpoint returns 403 to provider users who aren't admins. Let the caller show a
      // permission error instead of signing the user out.
      { logoutOnForbidden: false },
    );
    return new ProviderClientAutoscaleResponse(response);
  }

  createProviderOrganization(
    providerId: string,
    request: CreateProviderOrganizationRequest,
  ): Promise<void> {
    return this.apiService.send(
      "POST",
      "/providers/" + providerId + "/clients",
      request,
      true,
      false,
    );
  }
}
