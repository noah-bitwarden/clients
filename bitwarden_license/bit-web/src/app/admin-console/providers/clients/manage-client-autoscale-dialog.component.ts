import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { FormBuilder, ValidatorFn } from "@angular/forms";

import { ProviderApiServiceAbstraction } from "@bitwarden/common/admin-console/abstractions/provider/provider-api.service.abstraction";
import { UpdateProviderClientAutoscaleRequest } from "@bitwarden/common/admin-console/models/request/update-provider-client-autoscale.request";
import { ProviderOrganizationOrganizationDetailsResponse } from "@bitwarden/common/admin-console/models/response/provider/provider-organization.response";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import {
  DIALOG_DATA,
  DialogConfig,
  DialogRef,
  DialogService,
  FormControlModule,
  SwitchComponent,
  ToastService,
} from "@bitwarden/components";
import { SharedModule } from "@bitwarden/web-vault/app/shared";

export type ManageClientAutoscaleDialogParams = {
  providerId: string;
  organization: ProviderOrganizationOrganizationDetailsResponse;
};

export const ManageClientAutoscaleDialogResultType = Object.freeze({
  Closed: "closed",
  Submitted: "submitted",
} as const);
export type ManageClientAutoscaleDialogResultType =
  (typeof ManageClientAutoscaleDialogResultType)[keyof typeof ManageClientAutoscaleDialogResultType];

export const openManageClientAutoscaleDialog = (
  dialogService: DialogService,
  dialogConfig: DialogConfig<ManageClientAutoscaleDialogParams>,
) =>
  dialogService.open<ManageClientAutoscaleDialogResultType, ManageClientAutoscaleDialogParams>(
    ManageClientAutoscaleDialogComponent,
    dialogConfig,
  );

/**
 * Mirrors the server's rule: an optional seat limit must be a whole number, at least 1 and at least
 * the client's current seats.
 */
const seatLimitValidator =
  (minimum: number, getErrorMessage: () => string): ValidatorFn =>
  (control) => {
    const value: number | null = control.value;
    if (value == null) {
      return null;
    }
    return Number.isInteger(value) && value >= minimum
      ? null
      : { seatLimitBelowMinimum: { message: getErrorMessage() } };
  };

@Component({
  templateUrl: "manage-client-autoscale-dialog.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedModule, FormControlModule, SwitchComponent],
})
export class ManageClientAutoscaleDialogComponent {
  protected readonly dialogParams = inject<ManageClientAutoscaleDialogParams>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<ManageClientAutoscaleDialogResultType>>(DialogRef);
  private readonly providerApiService = inject(ProviderApiServiceAbstraction);
  private readonly i18nService = inject(I18nService);
  private readonly toastService = inject(ToastService);

  protected readonly ResultType = ManageClientAutoscaleDialogResultType;
  protected readonly minimumSeatLimit = Math.max(1, this.dialogParams.organization.seats ?? 0);

  protected readonly formGroup = inject(FormBuilder).group({
    enabled: [this.dialogParams.organization.autoscaleEnabled ?? false],
    seatLimit: [
      this.dialogParams.organization.autoscaleSeatLimit ?? null,
      seatLimitValidator(this.minimumSeatLimit, () =>
        this.i18nService.t("autoscaleSeatLimitMin", this.minimumSeatLimit),
      ),
    ],
  });

  readonly submit = async () => {
    this.formGroup.markAllAsTouched();

    if (this.formGroup.invalid) {
      return;
    }

    const request = new UpdateProviderClientAutoscaleRequest({
      enabled: this.formGroup.value.enabled ?? false,
      seatLimit: this.formGroup.value.seatLimit ?? null,
    });

    try {
      await this.providerApiService.updateProviderClientAutoscale(
        this.dialogParams.providerId,
        this.dialogParams.organization.id,
        request,
      );
    } catch (error) {
      if (error instanceof ErrorResponse && error.statusCode === 403) {
        this.toastService.showToast({
          variant: "error",
          message: this.i18nService.t("clientAutoscalePermissionError"),
        });
        return;
      }
      // Anything else, such as the server rejecting the seat limit, is shown by bitSubmit.
      throw error;
    }

    this.toastService.showToast({
      variant: "success",
      message: this.i18nService.t("clientAutoscaleUpdated"),
    });

    await this.dialogRef.close(this.ResultType.Submitted);
  };
}
