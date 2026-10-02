import { ChangeDetectionStrategy, Component, forwardRef } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { By } from "@angular/platform-browser";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { mock, MockProxy } from "jest-mock-extended";

import { UserVerificationFormInputComponent } from "@bitwarden/auth/angular";
import { UserVerificationService } from "@bitwarden/common/auth/abstractions/user-verification/user-verification.service.abstraction";
import { ApiKeyResponse } from "@bitwarden/common/auth/models/response/api-key.response";
import { Verification } from "@bitwarden/common/auth/types/verification";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { DIALOG_DATA, DialogRef, DialogService, ToastService } from "@bitwarden/components";

import { ProviderApiKeyRequest, ProviderApiKeyType } from "../models/provider-api-key.request";
import { ProviderApiKeyService } from "../services/provider-api-key.service";

import { ProviderApiKeyDialogComponent } from "./provider-api-key-dialog.component";

@Component({
  selector: "app-user-verification-form-input",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: "",
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UserVerificationFormInputStubComponent),
      multi: true,
    },
  ],
})
class UserVerificationFormInputStubComponent implements ControlValueAccessor {
  writeValue(): void {}
  registerOnChange(): void {}
  registerOnTouched(): void {}
}

describe("ProviderApiKeyDialogComponent", () => {
  beforeAll(() => {
    // DialogComponent uses IntersectionObserver to detect scrollable content, which Jest does not provide
    global.IntersectionObserver = class IntersectionObserver {
      disconnect() {}
      observe() {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      unobserve() {}
    } as any;
  });

  const providerId = "provider-id";
  const verification = { type: 0, secret: "password" } as unknown as Verification;

  let fixture: ComponentFixture<ProviderApiKeyDialogComponent>;
  let component: ProviderApiKeyDialogComponent;
  let providerApiKeyService: MockProxy<ProviderApiKeyService>;
  let userVerificationService: MockProxy<UserVerificationService>;
  let dialogService: MockProxy<DialogService>;
  let request: ProviderApiKeyRequest;

  beforeEach(async () => {
    providerApiKeyService = mock<ProviderApiKeyService>();
    userVerificationService = mock<UserVerificationService>();
    dialogService = mock<DialogService>();

    request = new ProviderApiKeyRequest();
    userVerificationService.buildRequest.mockResolvedValue(request);

    const i18nService = mock<I18nService>();
    i18nService.t.mockImplementation((key: string) => key);

    await TestBed.configureTestingModule({
      imports: [ProviderApiKeyDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: DIALOG_DATA, useValue: { providerId } },
        { provide: DialogRef, useValue: mock<DialogRef>() },
        { provide: DialogService, useValue: dialogService },
        { provide: ProviderApiKeyService, useValue: providerApiKeyService },
        { provide: UserVerificationService, useValue: userVerificationService },
        { provide: I18nService, useValue: i18nService },
        { provide: PlatformUtilsService, useValue: mock<PlatformUtilsService>() },
        { provide: ToastService, useValue: mock<ToastService>() },
      ],
    })
      // DialogModule provides its own DialogService, so the mock has to replace it explicitly
      .overrideProvider(DialogService, { useValue: dialogService })
      .overrideComponent(ProviderApiKeyDialogComponent, {
        remove: { imports: [UserVerificationFormInputComponent] },
        add: { imports: [UserVerificationFormInputStubComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ProviderApiKeyDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const query = (id: string) => fixture.debugElement.query(By.css(`#${id}`));
  const clientSecretValue = () =>
    (query("provider-api-key-dialog_input_client-secret").nativeElement as HTMLInputElement).value;

  async function verifyAndSubmit() {
    component["formGroup"].controls.secret.setValue(verification);
    await component["submit"]();
    fixture.detectChanges();
  }

  it("asks for verification and does not show the key before the user verifies", () => {
    expect(fixture.debugElement.query(By.css("app-user-verification-form-input"))).not.toBeNull();
    expect(query("provider-api-key-dialog_input_client-secret")).toBeNull();
    expect(query("provider-api-key-dialog_button_rotate")).toBeNull();
  });

  it("does not request the key when verification is missing", async () => {
    await component["submit"]();

    expect(userVerificationService.buildRequest).not.toHaveBeenCalled();
    expect(providerApiKeyService.getOrCreateApiKey).not.toHaveBeenCalled();
  });

  it("gets or creates the key after verification and shows it with the client ID", async () => {
    providerApiKeyService.getOrCreateApiKey.mockResolvedValue({
      apiKey: "api-key-value",
    } as ApiKeyResponse);

    await verifyAndSubmit();

    expect(userVerificationService.buildRequest).toHaveBeenCalledWith(
      verification,
      ProviderApiKeyRequest,
    );
    expect(request.type).toBe(ProviderApiKeyType.Default);
    expect(providerApiKeyService.getOrCreateApiKey).toHaveBeenCalledWith(providerId, request);
    expect(providerApiKeyService.rotateApiKey).not.toHaveBeenCalled();
    expect(clientSecretValue()).toBe("api-key-value");
    expect(
      (query("provider-api-key-dialog_input_client-id").nativeElement as HTMLInputElement).value,
    ).toBe("provider.provider-id");
    expect(query("provider-api-key-dialog_button_rotate")).not.toBeNull();
  });

  describe("rotate", () => {
    beforeEach(async () => {
      providerApiKeyService.getOrCreateApiKey.mockResolvedValue({
        apiKey: "api-key-value",
      } as ApiKeyResponse);
      await verifyAndSubmit();
    });

    it("keeps the current key when the user cancels the confirmation", async () => {
      dialogService.openSimpleDialog.mockResolvedValue(false);

      await component["rotate"]();
      fixture.detectChanges();

      expect(clientSecretValue()).toBe("api-key-value");
      expect(providerApiKeyService.rotateApiKey).not.toHaveBeenCalled();
    });

    it("requires verification again after confirming, then rotates and shows the new key", async () => {
      dialogService.openSimpleDialog.mockResolvedValue(true);
      providerApiKeyService.rotateApiKey.mockResolvedValue({
        apiKey: "rotated-api-key",
      } as ApiKeyResponse);

      await component["rotate"]();
      fixture.detectChanges();

      expect(dialogService.openSimpleDialog).toHaveBeenCalledWith(
        expect.objectContaining({ type: "danger" }),
      );
      expect(query("provider-api-key-dialog_input_client-secret")).toBeNull();
      expect(fixture.debugElement.query(By.css("app-user-verification-form-input"))).not.toBeNull();
      expect(providerApiKeyService.rotateApiKey).not.toHaveBeenCalled();

      await verifyAndSubmit();

      expect(providerApiKeyService.rotateApiKey).toHaveBeenCalledWith(providerId, request);
      expect(providerApiKeyService.getOrCreateApiKey).toHaveBeenCalledTimes(1);
      expect(clientSecretValue()).toBe("rotated-api-key");
    });

    it("restores the current key when the rotate request fails", async () => {
      dialogService.openSimpleDialog.mockResolvedValue(true);
      providerApiKeyService.rotateApiKey.mockRejectedValue(new Error("rotate failed"));

      await component["rotate"]();
      fixture.detectChanges();
      component["formGroup"].controls.secret.setValue(verification);

      await expect(component["submit"]()).rejects.toThrow("rotate failed");
      fixture.detectChanges();

      expect(providerApiKeyService.rotateApiKey).toHaveBeenCalledWith(providerId, request);
      expect(clientSecretValue()).toBe("api-key-value");
      expect(query("provider-api-key-dialog_button_rotate")).not.toBeNull();
      expect(fixture.debugElement.query(By.css("app-user-verification-form-input"))).toBeNull();
    });
  });
});
