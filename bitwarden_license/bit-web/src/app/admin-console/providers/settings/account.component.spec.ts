import { NO_ERRORS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { By } from "@angular/platform-browser";
import { ActivatedRoute, Router } from "@angular/router";
import { mock, MockProxy } from "jest-mock-extended";
import { BehaviorSubject, of } from "rxjs";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { ProviderApiServiceAbstraction } from "@bitwarden/common/admin-console/abstractions/provider/provider-api.service.abstraction";
import { ProviderService } from "@bitwarden/common/admin-console/abstractions/provider.service";
import {
  ProviderStatusType,
  ProviderType,
  ProviderUserStatusType,
  ProviderUserType,
} from "@bitwarden/common/admin-console/enums";
import { ProviderData } from "@bitwarden/common/admin-console/models/data/provider.data";
import { Provider } from "@bitwarden/common/admin-console/models/domain/provider";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { FeatureFlag } from "@bitwarden/common/enums/feature-flag.enum";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { mockAccountServiceWith } from "@bitwarden/common/spec";
import { UserId } from "@bitwarden/common/types/guid";
import { SyncService } from "@bitwarden/common/vault/abstractions/sync/sync.service.abstraction";
import { DialogService, ToastService } from "@bitwarden/components";
import { I18nPipe } from "@bitwarden/ui-common";

import { AccountComponent } from "./account.component";
import { ProviderApiKeyDialogComponent } from "./provider-api-key-dialog.component";

describe("Provider AccountComponent", () => {
  const providerId = "provider-id";
  const userId = "user-id" as UserId;

  let fixture: ComponentFixture<AccountComponent>;
  let configService: MockProxy<ConfigService>;
  let providerService: MockProxy<ProviderService>;
  let dialogService: MockProxy<DialogService>;
  let flagEnabled$: BehaviorSubject<boolean>;
  let provider$: BehaviorSubject<Provider | undefined>;

  const makeProvider = (overrides: Partial<ProviderData> = {}) =>
    new Provider({
      id: providerId,
      name: "Provider",
      status: ProviderUserStatusType.Confirmed,
      type: ProviderUserType.ProviderAdmin,
      enabled: true,
      userId,
      useEvents: true,
      providerStatus: ProviderStatusType.Billable,
      providerType: ProviderType.Msp,
      ...overrides,
    } as ProviderData);

  beforeEach(async () => {
    configService = mock<ConfigService>();
    providerService = mock<ProviderService>();
    dialogService = mock<DialogService>();
    flagEnabled$ = new BehaviorSubject(true);
    provider$ = new BehaviorSubject<Provider | undefined>(makeProvider());

    configService.getFeatureFlag$.mockImplementation((flag) =>
      flag === FeatureFlag.ProviderApiKey ? (flagEnabled$ as any) : of(false),
    );
    providerService.get$.mockReturnValue(provider$);

    const providerApiService = mock<ProviderApiServiceAbstraction>();
    providerApiService.getProvider.mockReturnValue(new Promise(() => {}));

    const i18nService = mock<I18nService>();
    i18nService.t.mockImplementation((key: string) => key);

    await TestBed.configureTestingModule({
      declarations: [AccountComponent],
      imports: [ReactiveFormsModule, I18nPipe],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { parent: { parent: { params: of({ providerId }) } } },
        },
        { provide: AccountService, useValue: mockAccountServiceWith(userId) },
        { provide: ApiService, useValue: mock<ApiService>() },
        { provide: ConfigService, useValue: configService },
        { provide: DialogService, useValue: dialogService },
        { provide: I18nService, useValue: i18nService },
        { provide: LogService, useValue: mock<LogService>() },
        { provide: PlatformUtilsService, useValue: mock<PlatformUtilsService>() },
        { provide: ProviderApiServiceAbstraction, useValue: providerApiService },
        { provide: ProviderService, useValue: providerService },
        { provide: Router, useValue: mock<Router>() },
        { provide: SyncService, useValue: mock<SyncService>() },
        { provide: ToastService, useValue: mock<ToastService>() },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountComponent);
  });

  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const viewApiKeyButton = () =>
    fixture.debugElement.query(By.css("#provider-account_button_view-api-key"));

  it("shows the API key section to a Provider Admin of an eligible provider", async () => {
    await render();

    expect(viewApiKeyButton()).not.toBeNull();
    expect(providerService.get$).toHaveBeenCalledWith(providerId, userId);
  });

  it("hides the API key section when the feature flag is off", async () => {
    flagEnabled$.next(false);

    await render();

    expect(viewApiKeyButton()).toBeNull();
  });

  it("hides the API key section from service users", async () => {
    provider$.next(makeProvider({ type: ProviderUserType.ServiceUser }));

    await render();

    expect(viewApiKeyButton()).toBeNull();
  });

  it.each([
    ["disabled", { enabled: false }],
    ["not billable", { providerStatus: ProviderStatusType.Pending }],
    ["a reseller", { providerType: ProviderType.Reseller }],
  ])("hides the API key section when the provider is %s", async (_, overrides) => {
    provider$.next(makeProvider(overrides));

    await render();

    expect(viewApiKeyButton()).toBeNull();
  });

  it("opens the provider API key dialog for the current provider", async () => {
    const openSpy = jest.spyOn(ProviderApiKeyDialogComponent, "open").mockReturnValue(null as any);
    await render();

    viewApiKeyButton().nativeElement.click();

    expect(openSpy).toHaveBeenCalledWith(dialogService, { data: { providerId } });
  });
});
