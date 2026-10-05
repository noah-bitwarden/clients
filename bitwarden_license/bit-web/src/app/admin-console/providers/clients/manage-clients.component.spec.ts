import { TestBed } from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import { mock, MockProxy } from "jest-mock-extended";
import { BehaviorSubject, firstValueFrom, of } from "rxjs";

import { ProviderApiServiceAbstraction } from "@bitwarden/common/admin-console/abstractions/provider/provider-api.service.abstraction";
import { ProviderService } from "@bitwarden/common/admin-console/abstractions/provider.service";
import {
  ProviderStatusType,
  ProviderType,
  ProviderUserType,
} from "@bitwarden/common/admin-console/enums";
import { Provider } from "@bitwarden/common/admin-console/models/domain/provider";
import { ProviderOrganizationOrganizationDetailsResponse } from "@bitwarden/common/admin-console/models/response/provider/provider-organization.response";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { BillingApiServiceAbstraction } from "@bitwarden/common/billing/abstractions";
import { FeatureFlag } from "@bitwarden/common/enums/feature-flag.enum";
import { ListResponse } from "@bitwarden/common/models/response/list.response";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { ValidationService } from "@bitwarden/common/platform/abstractions/validation.service";
import { DialogRef, DialogService, ToastService } from "@bitwarden/components";
import { BillingNotificationService } from "@bitwarden/web-vault/app/billing/services/billing-notification.service";

import { WebProviderService } from "../services/web-provider.service";

import {
  ManageClientAutoscaleDialogResultType,
  openManageClientAutoscaleDialog,
} from "./manage-client-autoscale-dialog.component";
import { ManageClientsComponent } from "./manage-clients.component";

jest.mock("./manage-client-autoscale-dialog.component", () => ({
  ...jest.requireActual("./manage-client-autoscale-dialog.component"),
  openManageClientAutoscaleDialog: jest.fn(),
}));

describe("ManageClientsComponent", () => {
  let configService: MockProxy<ConfigService>;
  let providerService: MockProxy<ProviderService>;
  let providerApiService: MockProxy<ProviderApiServiceAbstraction>;
  let billingApiService: MockProxy<BillingApiServiceAbstraction>;
  let flag$: BehaviorSubject<boolean>;

  const createProvider = (overrides: Partial<Provider> = {}) =>
    Object.assign(Object.create(Provider.prototype) as Provider, {
      id: "provider-1",
      type: ProviderUserType.ProviderAdmin,
      providerType: ProviderType.Msp,
      providerStatus: ProviderStatusType.Billable,
      enabled: true,
      ...overrides,
    });

  // The template needs the full component library; these tests cover the component's logic.
  const createComponent = (provider: Provider) => {
    providerService.get$.mockReturnValue(of(provider));
    TestBed.configureTestingModule({
      providers: [
        { provide: BillingApiServiceAbstraction, useValue: billingApiService },
        { provide: ProviderService, useValue: providerService },
        {
          provide: ActivatedRoute,
          useValue: { parent: { params: of({ providerId: "provider-1" }) }, queryParams: of({}) },
        },
        { provide: DialogService, useValue: mock<DialogService>() },
        { provide: I18nService, useValue: mock<I18nService>() },
        { provide: ToastService, useValue: mock<ToastService>() },
        { provide: ValidationService, useValue: mock<ValidationService>() },
        { provide: WebProviderService, useValue: mock<WebProviderService>() },
        { provide: BillingNotificationService, useValue: mock<BillingNotificationService>() },
        {
          provide: AccountService,
          useValue: { activeAccount$: of({ id: "user-1" }) },
        },
        { provide: ProviderApiServiceAbstraction, useValue: providerApiService },
        { provide: ConfigService, useValue: configService },
      ],
    }).overrideComponent(ManageClientsComponent, {
      set: { template: "", imports: [] },
    });
    return TestBed.createComponent(ManageClientsComponent).componentInstance;
  };

  beforeEach(() => {
    flag$ = new BehaviorSubject(true);
    configService = mock<ConfigService>();
    configService.getFeatureFlag$.mockImplementation((flag) =>
      flag === FeatureFlag.PM18793_ProviderClientSeatAutoscale ? flag$ : of(false),
    );
    providerService = mock<ProviderService>();
    providerApiService = mock<ProviderApiServiceAbstraction>();
    providerApiService.getProviderOrganizations.mockResolvedValue(
      new ListResponse({ Data: [] }, ProviderOrganizationOrganizationDetailsResponse),
    );
    billingApiService = mock<BillingApiServiceAbstraction>();
    billingApiService.getPlans.mockResolvedValue(new ListResponse({ Data: [] }, Object as any));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("seat autoscale action visibility", () => {
    it("shows the action to an admin of a billable MSP when the flag is on", async () => {
      const component = createComponent(createProvider());

      expect(await firstValueFrom(component["canManageAutoscale$"])).toBe(true);
    });

    it("hides the action from a service user", async () => {
      const component = createComponent(createProvider({ type: ProviderUserType.ServiceUser }));

      expect(await firstValueFrom(component["canManageAutoscale$"])).toBe(false);
    });

    it("hides the action when the flag is off", async () => {
      flag$.next(false);
      const component = createComponent(createProvider());

      expect(await firstValueFrom(component["canManageAutoscale$"])).toBe(false);
    });

    it("hides the action for a BusinessUnit provider", async () => {
      const component = createComponent(
        createProvider({ providerType: ProviderType.BusinessUnit }),
      );

      expect(await firstValueFrom(component["canManageAutoscale$"])).toBe(false);
    });

    it("hides the action for an MSP that isn't billable", async () => {
      const component = createComponent(
        createProvider({ providerStatus: ProviderStatusType.Created }),
      );

      expect(await firstValueFrom(component["canManageAutoscale$"])).toBe(false);
    });
  });

  describe("manageClientAutoscale", () => {
    const organization = Object.assign(new ProviderOrganizationOrganizationDetailsResponse({}), {
      id: "provider-org-1",
      organizationName: "Acme Inc",
      seats: 10,
    });

    const mockDialogResult = (result: ManageClientAutoscaleDialogResultType) =>
      jest.mocked(openManageClientAutoscaleDialog).mockReturnValue({
        closed: of(result),
      } as DialogRef<ManageClientAutoscaleDialogResultType>);

    it("opens the dialog for the client and reloads the list after a save", async () => {
      mockDialogResult(ManageClientAutoscaleDialogResultType.Submitted);
      const component = createComponent(createProvider());

      await component.manageClientAutoscale(organization);

      // Only the config is checked: matching the DialogService mock proxy confuses Jest's equality.
      expect(jest.mocked(openManageClientAutoscaleDialog).mock.calls[0][1]).toEqual({
        data: { providerId: "provider-1", organization },
      });
      expect(providerApiService.getProviderOrganizations).toHaveBeenCalledWith("provider-1");
    });

    it("doesn't reload the list when the dialog is closed without saving", async () => {
      mockDialogResult(ManageClientAutoscaleDialogResultType.Closed);
      const component = createComponent(createProvider());

      await component.manageClientAutoscale(organization);

      expect(providerApiService.getProviderOrganizations).not.toHaveBeenCalled();
    });
  });
});
