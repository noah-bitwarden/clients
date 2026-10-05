import { TestBed } from "@angular/core/testing";
import { mock, MockProxy } from "jest-mock-extended";

import { ProviderApiServiceAbstraction } from "@bitwarden/common/admin-console/abstractions/provider/provider-api.service.abstraction";
import { UpdateProviderClientAutoscaleRequest } from "@bitwarden/common/admin-console/models/request/update-provider-client-autoscale.request";
import { ProviderClientAutoscaleResponse } from "@bitwarden/common/admin-console/models/response/provider/provider-client-autoscale.response";
import { ProviderOrganizationOrganizationDetailsResponse } from "@bitwarden/common/admin-console/models/response/provider/provider-organization.response";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { DIALOG_DATA, DialogRef, ToastService } from "@bitwarden/components";

import {
  ManageClientAutoscaleDialogComponent,
  ManageClientAutoscaleDialogParams,
  ManageClientAutoscaleDialogResultType,
} from "./manage-client-autoscale-dialog.component";

describe("ManageClientAutoscaleDialogComponent", () => {
  let providerApiService: MockProxy<ProviderApiServiceAbstraction>;
  let dialogRef: MockProxy<DialogRef<ManageClientAutoscaleDialogResultType>>;
  let toastService: MockProxy<ToastService>;
  let i18nService: MockProxy<I18nService>;

  const createOrganization = (
    overrides: Partial<ProviderOrganizationOrganizationDetailsResponse> = {},
  ) =>
    Object.assign(new ProviderOrganizationOrganizationDetailsResponse({}), {
      id: "provider-org-1",
      organizationId: "org-1",
      organizationName: "Acme Inc",
      seats: 10,
      autoscaleEnabled: false,
      autoscaleSeatLimit: undefined,
      ...overrides,
    });

  // The template needs the full component library; these tests cover the component's logic.
  const createComponent = (organization = createOrganization()) => {
    const params: ManageClientAutoscaleDialogParams = { providerId: "provider-1", organization };
    TestBed.configureTestingModule({
      providers: [
        { provide: DIALOG_DATA, useValue: params },
        { provide: DialogRef, useValue: dialogRef },
        { provide: ProviderApiServiceAbstraction, useValue: providerApiService },
        { provide: ToastService, useValue: toastService },
        { provide: I18nService, useValue: i18nService },
      ],
    }).overrideComponent(ManageClientAutoscaleDialogComponent, {
      set: { template: "", imports: [] },
    });
    return TestBed.createComponent(ManageClientAutoscaleDialogComponent).componentInstance;
  };

  const formOf = (component: ManageClientAutoscaleDialogComponent) => component["formGroup"];

  beforeEach(() => {
    providerApiService = mock<ProviderApiServiceAbstraction>();
    dialogRef = mock<DialogRef<ManageClientAutoscaleDialogResultType>>();
    toastService = mock<ToastService>();
    i18nService = mock<I18nService>();
    i18nService.t.mockImplementation((key: string, ...args: unknown[]) => [key, ...args].join("|"));
    providerApiService.updateProviderClientAutoscale.mockResolvedValue(
      new ProviderClientAutoscaleResponse({ AutoscaleEnabled: true, AutoscaleSeatLimit: null }),
    );
  });

  describe("initial values", () => {
    it("reads the client's current settings", () => {
      const component = createComponent(
        createOrganization({ autoscaleEnabled: true, autoscaleSeatLimit: 25 }),
      );

      expect(formOf(component).value).toEqual({ enabled: true, seatLimit: 25 });
    });

    it("starts off with no limit when the client hasn't set one", () => {
      const component = createComponent();

      expect(formOf(component).value).toEqual({ enabled: false, seatLimit: null });
    });
  });

  describe("seat limit validation", () => {
    it.each([
      [null, true],
      [10, true],
      [11, true],
      [9, false],
      [0, false],
      [10.5, false],
    ])("seat limit %p is valid: %p (client has 10 seats)", (seatLimit, valid) => {
      const component = createComponent();
      const control = formOf(component).controls.seatLimit;

      control.setValue(seatLimit);

      expect(control.valid).toBe(valid);
    });

    it("explains the minimum when the limit is too low", () => {
      const component = createComponent();
      const control = formOf(component).controls.seatLimit;

      control.setValue(5);

      expect(control.errors).toEqual({
        seatLimitBelowMinimum: { message: "autoscaleSeatLimitMin|10" },
      });
    });

    it("requires at least 1 when the client has no seats", () => {
      const component = createComponent(createOrganization({ seats: 0 }));
      const control = formOf(component).controls.seatLimit;

      control.setValue(0);
      expect(control.valid).toBe(false);

      control.setValue(1);
      expect(control.valid).toBe(true);
    });

    it("doesn't save an invalid limit", async () => {
      const component = createComponent();
      formOf(component).controls.seatLimit.setValue(3);

      await component.submit();

      expect(providerApiService.updateProviderClientAutoscale).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe("submit", () => {
    it("saves the settings for the provider-organization and closes", async () => {
      const component = createComponent();
      formOf(component).setValue({ enabled: true, seatLimit: 20 });

      await component.submit();

      expect(providerApiService.updateProviderClientAutoscale).toHaveBeenCalledWith(
        "provider-1",
        "provider-org-1",
        new UpdateProviderClientAutoscaleRequest({ enabled: true, seatLimit: 20 }),
      );
      expect(toastService.showToast).toHaveBeenCalledWith({
        variant: "success",
        message: "clientAutoscaleUpdated",
      });
      expect(dialogRef.close).toHaveBeenCalledWith(ManageClientAutoscaleDialogResultType.Submitted);
    });

    it("sends an empty limit as null", async () => {
      const component = createComponent(
        createOrganization({ autoscaleEnabled: true, autoscaleSeatLimit: 25 }),
      );
      formOf(component).controls.seatLimit.setValue(null);

      await component.submit();

      expect(providerApiService.updateProviderClientAutoscale).toHaveBeenCalledWith(
        "provider-1",
        "provider-org-1",
        new UpdateProviderClientAutoscaleRequest({ enabled: true, seatLimit: null }),
      );
    });

    it("rethrows a server rejection so the dialog shows the server's message", async () => {
      const component = createComponent();
      const error = new ErrorResponse({ Message: "Seat limit is invalid." }, 400);
      providerApiService.updateProviderClientAutoscale.mockRejectedValue(error);

      await expect(component.submit()).rejects.toBe(error);

      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it("shows a permission error on 403", async () => {
      const component = createComponent();
      providerApiService.updateProviderClientAutoscale.mockRejectedValue(
        new ErrorResponse({ Message: "Forbidden" }, 403),
      );

      await component.submit();

      expect(toastService.showToast).toHaveBeenCalledWith({
        variant: "error",
        message: "clientAutoscalePermissionError",
      });
      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });
});
