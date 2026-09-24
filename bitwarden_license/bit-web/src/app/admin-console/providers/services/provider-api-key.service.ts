import { inject, Injectable } from "@angular/core";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { ApiKeyResponse } from "@bitwarden/common/auth/models/response/api-key.response";

import { ProviderApiKeyRequest } from "../models/provider-api-key.request";

/**
 * Provider API key endpoints. The server only accepts these from the web vault, so they are intentionally
 * not part of the shared provider API service used by other clients.
 */
@Injectable({ providedIn: "root" })
export class ProviderApiKeyService {
  private readonly apiService = inject(ApiService);

  async getOrCreateApiKey(
    providerId: string,
    request: ProviderApiKeyRequest,
  ): Promise<ApiKeyResponse> {
    const r = await this.apiService.send(
      "POST",
      "/providers/" + providerId + "/api-key",
      request,
      true,
      true,
    );
    return new ApiKeyResponse(r);
  }

  async rotateApiKey(providerId: string, request: ProviderApiKeyRequest): Promise<ApiKeyResponse> {
    const r = await this.apiService.send(
      "POST",
      "/providers/" + providerId + "/rotate-api-key",
      request,
      true,
      true,
    );
    return new ApiKeyResponse(r);
  }
}
