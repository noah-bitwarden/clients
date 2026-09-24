import { TestBed } from "@angular/core/testing";
import { mock, MockProxy } from "jest-mock-extended";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { ApiKeyResponse } from "@bitwarden/common/auth/models/response/api-key.response";

import { ProviderApiKeyRequest, ProviderApiKeyType } from "../models/provider-api-key.request";

import { ProviderApiKeyService } from "./provider-api-key.service";

describe("ProviderApiKeyService", () => {
  const providerId = "provider-id";
  const apiKeyResponse = {
    Object: "apiKey",
    ApiKey: "api-key-value",
    RevisionDate: "2026-09-23T22:00:00.000Z",
  };

  let apiService: MockProxy<ApiService>;
  let sut: ProviderApiKeyService;
  let request: ProviderApiKeyRequest;

  beforeEach(() => {
    apiService = mock<ApiService>();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiService, useValue: apiService }],
    });
    sut = TestBed.inject(ProviderApiKeyService);

    request = new ProviderApiKeyRequest();
    request.masterPasswordHash = "master-password-hash";
  });

  it("defaults the api key request type to BillingReadOnly", () => {
    expect(new ProviderApiKeyRequest().type).toBe(ProviderApiKeyType.BillingReadOnly);
  });

  describe("getOrCreateApiKey", () => {
    it("POSTs the verification request to the provider api-key endpoint", async () => {
      apiService.send.mockResolvedValue(apiKeyResponse);

      const result = await sut.getOrCreateApiKey(providerId, request);

      expect(apiService.send).toHaveBeenCalledWith(
        "POST",
        "/providers/provider-id/api-key",
        expect.objectContaining({ type: 0, masterPasswordHash: "master-password-hash" }),
        true,
        true,
      );
      expect(result).toBeInstanceOf(ApiKeyResponse);
      expect(result.apiKey).toBe("api-key-value");
      expect(result.revisionDate).toEqual(new Date("2026-09-23T22:00:00.000Z"));
    });

    it("sends an OTP for users without a master password", async () => {
      apiService.send.mockResolvedValue(apiKeyResponse);
      const otpRequest = new ProviderApiKeyRequest();
      otpRequest.otp = "123456";

      await sut.getOrCreateApiKey(providerId, otpRequest);

      expect(apiService.send).toHaveBeenCalledWith(
        "POST",
        "/providers/provider-id/api-key",
        expect.objectContaining({ type: 0, otp: "123456" }),
        true,
        true,
      );
    });
  });

  describe("rotateApiKey", () => {
    it("POSTs the verification request to the provider rotate-api-key endpoint", async () => {
      apiService.send.mockResolvedValue({ ...apiKeyResponse, ApiKey: "rotated-api-key" });

      const result = await sut.rotateApiKey(providerId, request);

      expect(apiService.send).toHaveBeenCalledWith(
        "POST",
        "/providers/provider-id/rotate-api-key",
        expect.objectContaining({ type: 0, masterPasswordHash: "master-password-hash" }),
        true,
        true,
      );
      expect(result.apiKey).toBe("rotated-api-key");
    });
  });
});
