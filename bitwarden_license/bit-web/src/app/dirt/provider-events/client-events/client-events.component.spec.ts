import { ChangeDetectionStrategy, Component, forwardRef, NO_ERRORS_SCHEMA } from "@angular/core";
import { ComponentFixture, fakeAsync, TestBed, tick } from "@angular/core/testing";
import { ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule } from "@angular/forms";
import { By } from "@angular/platform-browser";
import { ActivatedRoute, convertToParamMap, Router } from "@angular/router";
import { mock, MockProxy } from "jest-mock-extended";
import { of } from "rxjs";

import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { ProviderApiServiceAbstraction } from "@bitwarden/common/admin-console/abstractions/provider/provider-api.service.abstraction";
import { ProviderService } from "@bitwarden/common/admin-console/abstractions/provider.service";
import { Provider } from "@bitwarden/common/admin-console/models/domain/provider";
import { ProviderOrganizationOrganizationDetailsResponse } from "@bitwarden/common/admin-console/models/response/provider/provider-organization.response";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { EventResponse } from "@bitwarden/common/dirt/event-logs";
import { EventLogApiService } from "@bitwarden/common/dirt/event-logs/services/event-log-api.service";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { ListResponse } from "@bitwarden/common/models/response/list.response";
import { FileDownloadService } from "@bitwarden/common/platform/abstractions/file-download/file-download.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { ValidationService } from "@bitwarden/common/platform/abstractions/validation.service";
import { mockAccountServiceWith } from "@bitwarden/common/spec";
import { UserId } from "@bitwarden/common/types/guid";
import { SelectItemView, ToastService } from "@bitwarden/components";
import { I18nPipe } from "@bitwarden/ui-common";
import { EventService } from "@bitwarden/web-vault/app/dirt/event-logs";

import { ClientEventExportService } from "./client-event-export.service";
import { ClientEventUsersService } from "./client-event-users.service";
import {
  ClientEventsComponent,
  MAX_SELECTED_CLIENTS,
  SELECTION_RELOAD_DEBOUNCE_MS,
} from "./client-events.component";

/** Stands in for `bit-multi-select`; the tests drive the selection through the form control. */
@Component({
  selector: "bit-multi-select",
  template: "",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MultiSelectStubComponent),
      multi: true,
    },
  ],
})
class MultiSelectStubComponent implements ControlValueAccessor {
  writeValue() {}
  registerOnChange() {}
  registerOnTouched() {}
}

describe("ClientEventsComponent", () => {
  const providerId = "provider-1";
  const userId = "user-1" as UserId;

  let fixture: ComponentFixture<ClientEventsComponent>;
  let component: ClientEventsComponent;
  let eventLogApiService: MockProxy<EventLogApiService>;
  let providerApiService: MockProxy<ProviderApiServiceAbstraction>;
  let toastService: MockProxy<ToastService>;
  let validationService: MockProxy<ValidationService>;

  /** Client ids sort the same as their names ("Client 01", "Client 02", ...). */
  const clientId = (n: number) => `org-${String(n).padStart(2, "0")}`;
  const clientIds = (count: number) => Array.from({ length: count }, (_, i) => clientId(i + 1));

  const setClients = (count: number) =>
    providerApiService.getProviderOrganizations.mockResolvedValue(
      new ListResponse(
        {
          data: clientIds(count).map((id, i) => ({
            id: `rel-${id}`,
            organizationId: id,
            organizationName: `Client ${String(i + 1).padStart(2, "0")}`,
          })),
        },
        ProviderOrganizationOrganizationDetailsResponse,
      ),
    );

  const page = (organizationIds: string[], continuationToken: string | null = null) =>
    new ListResponse(
      {
        data: organizationIds.map((organizationId) => ({ organizationId, type: 1000 })),
        continuationToken,
      },
      EventResponse,
    );

  const options = (ids: string[]): SelectItemView[] =>
    ids.map((id) => ({ id, listName: id, labelName: id }));

  const query = (testId: string) => fixture.debugElement.query(By.css(`[data-testid="${testId}"]`));

  const init = () => {
    fixture = TestBed.createComponent(ClientEventsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
  };

  const select = (ids: string[]) => {
    (component as any).clientsControl.setValue(options(ids));
    tick(SELECTION_RELOAD_DEBOUNCE_MS);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    eventLogApiService = mock<EventLogApiService>();
    eventLogApiService.getEventsProviderClients.mockImplementation(async (_, ids) =>
      page(ids, "token-1"),
    );
    providerApiService = mock<ProviderApiServiceAbstraction>();
    setClients(3);
    toastService = mock<ToastService>();
    validationService = mock<ValidationService>();

    const eventService = mock<EventService>();
    eventService.getDefaultDateFilters.mockReturnValue(["2026-09-01T00:00", "2026-09-29T23:59"]);
    eventService.formatDateFilters.mockReturnValue(["start", "end"]);
    eventService.getEventInfo.mockResolvedValue({
      message: "message",
      humanReadableMessage: "message",
      appIcon: "bwi-globe",
      appName: "Web vault",
    });

    const providerService = mock<ProviderService>();
    providerService.get$.mockReturnValue(of({ id: providerId, useEvents: true } as Provider));

    const organizationService = mock<OrganizationService>();
    organizationService.organizations$.mockReturnValue(of([]));

    const i18nService = mock<I18nService>();
    i18nService.t.mockImplementation((key: string) => key);
    i18nService.collator = new Intl.Collator("en");

    const users = mock<ClientEventUsersService>();
    users.loadProviderUsers.mockResolvedValue();
    users.loadMembersFor.mockResolvedValue();
    users.getUser.mockReturnValue(null);

    await TestBed.configureTestingModule({
      imports: [ClientEventsComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({ providerId }),
            paramMap: of(convertToParamMap({ providerId })),
          },
        },
        { provide: AccountService, useValue: mockAccountServiceWith(userId) },
        { provide: EventLogApiService, useValue: eventLogApiService },
        { provide: EventService, useValue: eventService },
        { provide: FileDownloadService, useValue: mock<FileDownloadService>() },
        { provide: I18nService, useValue: i18nService },
        { provide: LogService, useValue: mock<LogService>() },
        { provide: OrganizationService, useValue: organizationService },
        { provide: PlatformUtilsService, useValue: mock<PlatformUtilsService>() },
        { provide: ProviderApiServiceAbstraction, useValue: providerApiService },
        { provide: ProviderService, useValue: providerService },
        { provide: Router, useValue: mock<Router>() },
        { provide: ToastService, useValue: toastService },
        { provide: ValidationService, useValue: validationService },
      ],
    })
      .overrideComponent(ClientEventsComponent, {
        set: {
          imports: [ReactiveFormsModule, I18nPipe, MultiSelectStubComponent],
          providers: [
            { provide: ClientEventUsersService, useValue: users },
            ClientEventExportService,
          ],
          schemas: [NO_ERRORS_SCHEMA],
        },
      })
      .compileComponents();
  });

  describe("default selection", () => {
    it("selects every client when there are 10 or fewer, and loads their events", fakeAsync(() => {
      setClients(MAX_SELECTED_CLIENTS);
      init();

      expect((component as any).selectedClientIds()).toEqual(clientIds(MAX_SELECTED_CLIENTS));
      expect(eventLogApiService.getEventsProviderClients).toHaveBeenCalledTimes(1);
      expect(eventLogApiService.getEventsProviderClients).toHaveBeenCalledWith(
        providerId,
        clientIds(MAX_SELECTED_CLIENTS),
        "start",
        "end",
        null,
      );
      expect(query("events-table")).not.toBeNull();
    }));

    it("selects none when there are more than 10, shows the empty state, and makes no request", fakeAsync(() => {
      setClients(MAX_SELECTED_CLIENTS + 1);
      init();

      expect((component as any).selectedClientIds()).toEqual([]);
      expect(eventLogApiService.getEventsProviderClients).not.toHaveBeenCalled();
      expect(query("no-clients-selected")).not.toBeNull();
      expect(query("events-table")).toBeNull();
    }));

    it("lists the clients sorted by name", fakeAsync(() => {
      providerApiService.getProviderOrganizations.mockResolvedValue(
        new ListResponse(
          {
            data: [
              { organizationId: "b", organizationName: "Beta" },
              { organizationId: "a", organizationName: "Alpha" },
            ],
          },
          ProviderOrganizationOrganizationDetailsResponse,
        ),
      );
      init();

      expect((component as any).clientOptions().map((c: SelectItemView) => c.listName)).toEqual([
        "Alpha",
        "Beta",
      ]);
    }));
  });

  describe("selection limit", () => {
    beforeEach(() => setClients(MAX_SELECTED_CLIENTS + 2));

    it("blocks an 11th selection and shows the limit message", fakeAsync(() => {
      init();
      select(clientIds(MAX_SELECTED_CLIENTS));
      expect(query("client-limit-hint")).not.toBeNull();
      eventLogApiService.getEventsProviderClients.mockClear();

      select(clientIds(MAX_SELECTED_CLIENTS + 1));

      const control = (component as any).clientsControl;
      expect(control.value.map((c: SelectItemView) => c.id)).toEqual(
        clientIds(MAX_SELECTED_CLIENTS),
      );
      expect((component as any).selectedClientIds()).toEqual(clientIds(MAX_SELECTED_CLIENTS));
      expect(query("client-limit-hint")).not.toBeNull();
      expect(eventLogApiService.getEventsProviderClients).not.toHaveBeenCalled();
    }));

    it("hides the limit message below the limit", fakeAsync(() => {
      init();
      select(clientIds(2));

      expect(query("client-limit-hint")).toBeNull();
    }));
  });

  describe("changing the selection", () => {
    it("drops the continuation token and reloads from page one", fakeAsync(() => {
      init();
      expect(component.continuationToken).toBe("token-1");
      eventLogApiService.getEventsProviderClients.mockClear();

      (component as any).clientsControl.setValue(options([clientId(2), clientId(1)]));
      expect(component.continuationToken).toBeNull();

      tick(SELECTION_RELOAD_DEBOUNCE_MS);

      expect(eventLogApiService.getEventsProviderClients).toHaveBeenCalledTimes(1);
      expect(eventLogApiService.getEventsProviderClients).toHaveBeenCalledWith(
        providerId,
        [clientId(1), clientId(2)],
        "start",
        "end",
        null,
      );
    }));

    it("makes one request for several quick changes", fakeAsync(() => {
      init();
      eventLogApiService.getEventsProviderClients.mockClear();

      (component as any).clientsControl.setValue(options([clientId(1)]));
      tick(100);
      (component as any).clientsControl.setValue(options([clientId(1), clientId(2)]));
      tick(SELECTION_RELOAD_DEBOUNCE_MS);

      expect(eventLogApiService.getEventsProviderClients).toHaveBeenCalledTimes(1);
    }));

    it("clears the table without a request when every client is deselected", fakeAsync(() => {
      init();
      eventLogApiService.getEventsProviderClients.mockClear();

      select([]);

      expect(eventLogApiService.getEventsProviderClients).not.toHaveBeenCalled();
      expect(component.events()).toEqual([]);
      expect(query("no-clients-selected")).not.toBeNull();
    }));

    it("keeps sending a token with the clients it was issued for", fakeAsync(() => {
      init();
      (component as any).clientsControl.setValue(options([clientId(1)]));
      eventLogApiService.getEventsProviderClients.mockClear();

      // e.g. an export still paging through the traversal that returned token-1
      void (component as any).requestEvents("start", "end", "token-1", "export");
      tick();

      expect(eventLogApiService.getEventsProviderClients).toHaveBeenCalledWith(
        providerId,
        clientIds(3),
        "start",
        "end",
        "token-1",
      );
      tick(SELECTION_RELOAD_DEBOUNCE_MS);
    }));
  });

  describe("client column", () => {
    it("is shown when two or more clients are selected", fakeAsync(() => {
      init();
      select(clientIds(2));

      expect(query("client-column-header")).not.toBeNull();
    }));

    it("is hidden when one client is selected", fakeAsync(() => {
      init();
      select([clientId(1)]);

      expect(query("client-column-header")).toBeNull();
      expect(query("events-table")).not.toBeNull();
    }));
  });

  describe("load more", () => {
    it("appends the next page using the continuation token", fakeAsync(() => {
      init();
      eventLogApiService.getEventsProviderClients.mockResolvedValue(page([clientId(1)], null));

      void component.loadMoreEvents();
      tick();

      expect(eventLogApiService.getEventsProviderClients).toHaveBeenLastCalledWith(
        providerId,
        clientIds(3),
        "start",
        "end",
        "token-1",
      );
      expect(component.events()).toHaveLength(4);
      expect(component.continuationToken).toBeNull();
    }));

    it("throws when the page fails, and stops loading but keeps the rows and token", fakeAsync(() => {
      init();
      const error = new ErrorResponse(null, 500);
      eventLogApiService.getEventsProviderClients.mockRejectedValue(error);

      let thrown: unknown;
      component.loadMoreEvents().catch((e: unknown) => {
        thrown = e;
      });
      tick();

      expect(thrown).toBe(error);
      expect(component.loading()).toBe(false);
      expect(component.events()).toHaveLength(3);
      expect(component.continuationToken).toBe("token-1");
    }));
  });

  describe("rate limits", () => {
    const rateLimited = () => new ErrorResponse(null, 429);

    it("retries an export page 5 times, then shows the rate-limit toast", fakeAsync(() => {
      init();
      eventLogApiService.getEventsProviderClients.mockClear();
      eventLogApiService.getEventsProviderClients.mockRejectedValue(rateLimited());

      let error: unknown;
      (component as any).requestEvents("start", "end", "token-1", "export").catch((e: unknown) => {
        error = e;
      });
      tick(2000 + 4000 + 8000 + 16000 + 30000);

      expect(eventLogApiService.getEventsProviderClients).toHaveBeenCalledTimes(6);
      expect(error).toBeInstanceOf(ErrorResponse);
      expect(toastService.showToast).toHaveBeenCalledWith(
        expect.objectContaining({ message: "clientEventsExportRateLimited" }),
      );
    }));

    it("retries a table page once, without the export toast", fakeAsync(() => {
      init();
      eventLogApiService.getEventsProviderClients.mockClear();
      eventLogApiService.getEventsProviderClients.mockRejectedValue(rateLimited());

      let error: unknown;
      (component as any).requestEvents("start", "end", "token-1", "page").catch((e: unknown) => {
        error = e;
      });
      tick(2000);

      expect(eventLogApiService.getEventsProviderClients).toHaveBeenCalledTimes(2);
      expect(error).toBeInstanceOf(ErrorResponse);
      expect(toastService.showToast).not.toHaveBeenCalled();
    }));

    it("shows the normal error when a selection reload fails", fakeAsync(() => {
      init();
      eventLogApiService.getEventsProviderClients.mockRejectedValue(new ErrorResponse(null, 400));

      select([clientId(1)]);

      expect(validationService.showError).toHaveBeenCalled();
      expect(component.loading()).toBe(false);
    }));
  });
});
