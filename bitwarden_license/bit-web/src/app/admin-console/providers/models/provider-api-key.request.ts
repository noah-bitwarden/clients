import { SecretVerificationRequest } from "@bitwarden/common/auth/models/request/secret-verification.request";

export const ProviderApiKeyType = Object.freeze({
  Default: 0,
} as const);

export type ProviderApiKeyType = (typeof ProviderApiKeyType)[keyof typeof ProviderApiKeyType];

export class ProviderApiKeyRequest extends SecretVerificationRequest {
  type: ProviderApiKeyType = ProviderApiKeyType.Default;
}
