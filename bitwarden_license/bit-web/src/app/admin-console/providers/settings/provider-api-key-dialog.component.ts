import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";

import { UserVerificationFormInputComponent } from "@bitwarden/auth/angular";
import { UserVerificationService } from "@bitwarden/common/auth/abstractions/user-verification/user-verification.service.abstraction";
import { Verification } from "@bitwarden/common/auth/types/verification";
import {
  AsyncActionsModule,
  ButtonModule,
  CalloutModule,
  CopyClickDirective,
  DIALOG_DATA,
  DialogConfig,
  DialogModule,
  DialogService,
  FormFieldModule,
  IconButtonModule,
  TypographyModule,
} from "@bitwarden/components";
import { I18nPipe } from "@bitwarden/ui-common";

import { ProviderApiKeyRequest } from "../models/provider-api-key.request";
import { ProviderApiKeyService } from "../services/provider-api-key.service";

export type ProviderApiKeyDialogData = {
  providerId: string;
};

/**
 * Lets a Provider Admin view, and then optionally rotate, their provider's API key.
 * The user must verify before each request. The key only lives in this dialog's state.
 */
@Component({
  selector: "provider-api-key-dialog",
  templateUrl: "provider-api-key-dialog.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncActionsModule,
    ButtonModule,
    CalloutModule,
    CopyClickDirective,
    DialogModule,
    FormFieldModule,
    I18nPipe,
    IconButtonModule,
    ReactiveFormsModule,
    TypographyModule,
    UserVerificationFormInputComponent,
  ],
})
export class ProviderApiKeyDialogComponent {
  private readonly data = inject<ProviderApiKeyDialogData>(DIALOG_DATA);
  private readonly formBuilder = inject(FormBuilder);
  private readonly providerApiKeyService = inject(ProviderApiKeyService);
  private readonly userVerificationService = inject(UserVerificationService);
  private readonly dialogService = inject(DialogService);

  protected readonly clientId = `provider.${this.data.providerId}`;
  protected readonly clientSecret = signal<string | null>(null);
  protected readonly rotating = signal(false);
  protected readonly description = computed(() =>
    this.rotating() ? "apiKeyRotateDesc" : "apiKeyDesc",
  );

  protected readonly formGroup = this.formBuilder.group({
    secret: [null as Verification | null, [Validators.required]],
  });

  protected readonly submit = async () => {
    const secret = this.formGroup.value.secret;
    if (this.formGroup.invalid || secret == null) {
      this.formGroup.markAllAsTouched();
      return;
    }

    const request = await this.userVerificationService.buildRequest(secret, ProviderApiKeyRequest);
    const response = this.rotating()
      ? await this.providerApiKeyService.rotateApiKey(this.data.providerId, request)
      : await this.providerApiKeyService.getOrCreateApiKey(this.data.providerId, request);

    this.formGroup.reset();
    this.rotating.set(false);
    this.clientSecret.set(response.apiKey);
  };

  protected readonly rotate = async () => {
    const confirmed = await this.dialogService.openSimpleDialog({
      title: { key: "rotateApiKey" },
      content: { key: "rotateApiKeyConfirmation" },
      acceptButtonText: { key: "rotateApiKey" },
      type: "danger",
    });
    if (!confirmed) {
      return;
    }

    // Hide the current key and ask the user to verify again before rotating it
    this.clientSecret.set(null);
    this.rotating.set(true);
  };

  static open(dialogService: DialogService, config: DialogConfig<ProviderApiKeyDialogData>) {
    return dialogService.open(ProviderApiKeyDialogComponent, config);
  }
}
