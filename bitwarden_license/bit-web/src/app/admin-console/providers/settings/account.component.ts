// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { Component, OnDestroy, OnInit } from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { combineLatest, map, Observable, of, Subject, switchMap, takeUntil } from "rxjs";

import { UserVerificationDialogComponent } from "@bitwarden/auth/angular";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { ProviderApiServiceAbstraction } from "@bitwarden/common/admin-console/abstractions/provider/provider-api.service.abstraction";
import { ProviderService } from "@bitwarden/common/admin-console/abstractions/provider.service";
import { ProviderStatusType, ProviderType } from "@bitwarden/common/admin-console/enums";
import { Provider } from "@bitwarden/common/admin-console/models/domain/provider";
import { ProviderUpdateRequest } from "@bitwarden/common/admin-console/models/request/provider/provider-update.request";
import { ProviderResponse } from "@bitwarden/common/admin-console/models/response/provider/provider.response";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import { FeatureFlag } from "@bitwarden/common/enums/feature-flag.enum";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { SyncService } from "@bitwarden/common/vault/abstractions/sync/sync.service.abstraction";
import { DialogService, ToastService } from "@bitwarden/components";

import { ProviderApiKeyDialogComponent } from "./provider-api-key-dialog.component";

// FIXME(https://bitwarden.atlassian.net/browse/CL-764): Migrate to OnPush
// eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection
@Component({
  selector: "provider-account",
  templateUrl: "account.component.html",
  standalone: false,
})
export class AccountComponent implements OnDestroy, OnInit {
  selfHosted = false;
  loading = true;
  provider: ProviderResponse;
  taxFormPromise: Promise<any>;

  private destroy$ = new Subject<void>();
  private providerId: string;
  protected formGroup = this.formBuilder.group({
    providerName: ["" as ProviderResponse["name"]],
    providerBillingEmail: ["" as ProviderResponse["billingEmail"], Validators.email],
  });

  /** Only Provider Admins of providers the server issues API keys to can see the API key section */
  protected showApiKeySection$: Observable<boolean>;

  constructor(
    private apiService: ApiService,
    private i18nService: I18nService,
    private route: ActivatedRoute,
    private syncService: SyncService,
    private platformUtilsService: PlatformUtilsService,
    private logService: LogService,
    private dialogService: DialogService,
    private configService: ConfigService,
    private providerApiService: ProviderApiServiceAbstraction,
    private formBuilder: FormBuilder,
    private router: Router,
    private toastService: ToastService,
    private accountService: AccountService,
    private providerService: ProviderService,
  ) {}

  async ngOnInit() {
    this.selfHosted = this.platformUtilsService.isSelfHost();
    this.showApiKeySection$ = this.configService.getFeatureFlag$(FeatureFlag.ProviderApiKey).pipe(
      switchMap((enabled) =>
        enabled
          ? combineLatest([
              this.route.parent.parent.params,
              getUserId(this.accountService.activeAccount$),
            ]).pipe(
              switchMap(([params, userId]) => this.providerService.get$(params.providerId, userId)),
              map((provider) => this.canManageApiKey(provider)),
            )
          : of(false),
      ),
    );
    this.route.parent.parent.params
      .pipe(
        switchMap(async (params) => {
          this.providerId = params.providerId;
          try {
            this.provider = await this.providerApiService.getProvider(this.providerId);
            this.formGroup.patchValue({
              providerName: this.provider.name,
              providerBillingEmail: this.provider.billingEmail,
            });
          } catch (e) {
            this.logService.error(`Handled exception: ${e}`);
          } finally {
            this.loading = false;
          }
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();
  }
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
  submit = async () => {
    const request = new ProviderUpdateRequest({
      name: this.formGroup.value.providerName,
      businessName: this.formGroup.value.providerName,
      billingEmail: this.formGroup.value.providerBillingEmail,
    });

    await this.providerApiService.putProvider(this.providerId, request);
    await this.syncService.fullSync(true);
    this.provider = await this.providerApiService.getProvider(this.providerId);
    this.toastService.showToast({
      variant: "success",
      title: null,
      message: this.i18nService.t("providerUpdated"),
    });
  };

  async deleteProvider() {
    const providerClients = await this.apiService.getProviderClients(this.providerId);
    if (providerClients.data != null && providerClients.data.length > 0) {
      await this.dialogService.openSimpleDialog({
        title: { key: "deleteProviderName", placeholders: [this.provider.name] },
        content: { key: "deleteProviderWarningDescription", placeholders: [this.provider.name] },
        acceptButtonText: { key: "ok" },
        cancelButtonText: { key: "close" },
        type: "danger",
      });

      return false;
    }

    const userVerified = await this.verifyUser();
    if (!userVerified) {
      return;
    }

    try {
      await this.providerApiService.deleteProvider(this.providerId);
      this.toastService.showToast({
        variant: "success",
        title: this.i18nService.t("providerDeleted"),
        message: this.i18nService.t("providerDeletedDesc"),
      });
    } catch (e) {
      this.logService.error(e);
    }
    await this.router.navigate(["/"]);
  }

  viewApiKey() {
    ProviderApiKeyDialogComponent.open(this.dialogService, {
      data: { providerId: this.providerId },
    });
  }

  /** Mirrors the server's eligibility checks for the provider API key endpoints */
  private canManageApiKey(provider: Provider | undefined): boolean {
    return (
      provider != null &&
      provider.isProviderAdmin &&
      provider.enabled &&
      provider.providerStatus === ProviderStatusType.Billable &&
      provider.providerType === ProviderType.Msp
    );
  }

  private async verifyUser(): Promise<boolean> {
    const confirmDescription = "deleteProviderConfirmation";
    const result = await UserVerificationDialogComponent.open(this.dialogService, {
      title: "deleteProvider",
      bodyText: confirmDescription,
      confirmButtonOptions: {
        text: "deleteProvider",
        type: "danger",
      },
    });

    // Handle the result of the dialog based on user action and verification success
    if (result.userAction === "cancel") {
      // User cancelled the dialog
      return false;
    }

    // User confirmed the dialog so check verification success
    if (!result.verificationSuccess) {
      return false;
    }
    return true;
  }
}
