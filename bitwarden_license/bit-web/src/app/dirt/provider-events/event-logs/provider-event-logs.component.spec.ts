import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter, Router, Routes } from "@angular/router";
import { mock, MockProxy } from "jest-mock-extended";
import { BehaviorSubject } from "rxjs";

import { FeatureFlag } from "@bitwarden/common/enums/feature-flag.enum";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { ToastService } from "@bitwarden/components";
import { I18nPipe } from "@bitwarden/ui-common";

import { ProviderEventLogsComponent } from "./provider-event-logs.component";
import { providerEventLogsChildRoutes } from "./provider-event-logs.routes";

describe("Provider event logs", () => {
  let configService: MockProxy<ConfigService>;
  let flagEnabled$: BehaviorSubject<boolean>;

  beforeEach(() => {
    configService = mock<ConfigService>();
    flagEnabled$ = new BehaviorSubject(false);
    configService.getFeatureFlag$.mockImplementation(
      (flag) => (flag === FeatureFlag.ProviderClientEvents ? flagEnabled$ : undefined) as any,
    );
    configService.getFeatureFlag.mockImplementation(async (flag) =>
      flag === FeatureFlag.ProviderClientEvents ? (flagEnabled$.value as any) : false,
    );
  });

  describe("tabs", () => {
    let fixture: ComponentFixture<ProviderEventLogsComponent>;

    beforeEach(async () => {
      const i18nService = mock<I18nService>();
      i18nService.t.mockImplementation((key: string) => key);

      await TestBed.configureTestingModule({
        imports: [ProviderEventLogsComponent],
        providers: [
          { provide: ConfigService, useValue: configService },
          { provide: I18nService, useValue: i18nService },
        ],
      })
        .overrideComponent(ProviderEventLogsComponent, {
          set: { imports: [I18nPipe], schemas: [NO_ERRORS_SCHEMA] },
        })
        .compileComponents();

      fixture = TestBed.createComponent(ProviderEventLogsComponent);
    });

    const clientEventsTab = () =>
      fixture.debugElement.query(By.css('[data-testid="client-events-tab"]'));

    it("hides the tabs when the flag is off", () => {
      fixture.detectChanges();

      expect(clientEventsTab()).toBeNull();
      expect(fixture.debugElement.query(By.css("bit-tab-nav-bar"))).toBeNull();
    });

    it("shows the Client events tab when the flag is on", () => {
      flagEnabled$.next(true);
      fixture.detectChanges();

      expect(clientEventsTab()).not.toBeNull();
    });
  });

  describe("routes", () => {
    @Component({ template: "", changeDetection: ChangeDetectionStrategy.OnPush })
    class StubComponent {}

    // The real tab components need the whole page's services; the guards are what's under test.
    const routes: Routes = [
      {
        path: "events",
        children: providerEventLogsChildRoutes.map((r) =>
          r.component ? { ...r, component: StubComponent } : r,
        ),
      },
    ];

    let router: Router;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          provideRouter(routes),
          { provide: ConfigService, useValue: configService },
          { provide: I18nService, useValue: mock<I18nService>() },
          { provide: LogService, useValue: mock<LogService>() },
          { provide: ToastService, useValue: mock<ToastService>() },
        ],
      });
      router = TestBed.inject(Router);
    });

    it("lands on Provider events from the page's own URL", async () => {
      await router.navigateByUrl("/events");

      expect(router.url).toBe("/events/provider");
    });

    it("blocks the Client events route when the flag is off", async () => {
      await expect(router.navigateByUrl("/events/clients")).resolves.toBe(false);
    });

    it("opens the Client events route when the flag is on", async () => {
      flagEnabled$.next(true);

      await expect(router.navigateByUrl("/events/clients")).resolves.toBe(true);
      expect(router.url).toBe("/events/clients");
    });
  });
});
