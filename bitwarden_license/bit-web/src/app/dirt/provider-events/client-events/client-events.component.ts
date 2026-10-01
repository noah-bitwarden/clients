// FIXME(https://bitwarden.atlassian.net/browse/CL-1062): `OnPush` components should not use mutable properties
/* eslint-disable @bitwarden/components/enforce-readonly-angular-properties */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import {
  concatMap,
  debounceTime,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  map,
  switchMap,
} from "rxjs";

import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { ProviderApiServiceAbstraction } from "@bitwarden/common/admin-console/abstractions/provider/provider-api.service.abstraction";
import { ProviderService } from "@bitwarden/common/admin-console/abstractions/provider.service";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import { EventResponse, EventView } from "@bitwarden/common/dirt/event-logs";
import { EventLogApiService } from "@bitwarden/common/dirt/event-logs/services/event-log-api.service";
import { ListResponse } from "@bitwarden/common/models/response/list.response";
import { FileDownloadService } from "@bitwarden/common/platform/abstractions/file-download/file-download.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { ValidationService } from "@bitwarden/common/platform/abstractions/validation.service";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import { SelectItemView, ToastService } from "@bitwarden/components";
import { safeProvider } from "@bitwarden/ui-common";
import {
  BaseEventsComponent,
  EventService,
  EventsRequestPurpose,
} from "@bitwarden/web-vault/app/dirt/event-logs";
import { SharedModule } from "@bitwarden/web-vault/app/shared";

import { ClientEventExportService } from "./client-event-export.service";
import { ClientEventUsersService } from "./client-event-users.service";
import { ClientEventView } from "./client-event.view";
import { isRateLimitError, retryOnRateLimit } from "./retry-on-rate-limit";

/** The server's limit on clients per request. */
export const MAX_SELECTED_CLIENTS = 10;

/** Retries of a rate-limited page: the export pages back to back, "Load more" is clicked by hand. */
const EXPORT_MAX_RETRIES = 5;
const PAGE_MAX_RETRIES = 1;

/** Waits for the selection to settle so picking several clients makes one request, not one each. */
export const SELECTION_RELOAD_DEBOUNCE_MS = 500;

/**
 * Events from the provider's client organizations, merged newest first across up to
 * {@link MAX_SELECTED_CLIENTS} selected clients.
 */
@Component({
  selector: "provider-client-events",
  templateUrl: "client-events.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedModule],
  providers: [safeProvider(ClientEventExportService), safeProvider(ClientEventUsersService)],
})
export class ClientEventsComponent extends BaseEventsComponent implements OnInit {
  readonly exportFileName = "provider-client-events";
  protected readonly maxSelectedClients = MAX_SELECTED_CLIENTS;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly providerService = inject(ProviderService);
  private readonly providerApiService = inject(ProviderApiServiceAbstraction);
  private readonly eventLogApiService = inject(EventLogApiService);
  private readonly users = inject(ClientEventUsersService);
  private readonly validationService = inject(ValidationService);
  private readonly destroyRef = inject(DestroyRef);

  providerId = "";

  protected readonly clientOptions = signal<SelectItemView[]>([]);
  protected readonly clientsControl = new FormControl<SelectItemView[]>([]);
  protected readonly selectedClientIds = signal<string[]>([]);
  /** True between a selection change and the reload it triggers. */
  protected readonly reloadPending = signal(false);
  protected readonly showClientColumn = computed(() => this.selectedClientIds().length > 1);
  protected readonly selectionLimitReached = computed(
    () => this.selectedClientIds().length >= MAX_SELECTED_CLIENTS,
  );

  private clientNames = new Map<string, string>();
  /**
   * The server binds a continuation token to the exact client set of its traversal, so each token
   * is sent with the set it came from, even if the selection has changed since (e.g. mid-export).
   */
  private readonly tokenClientIds = new Map<string, string[]>();

  constructor() {
    super(
      inject(EventService),
      inject(I18nService),
      inject(ClientEventExportService),
      inject(PlatformUtilsService),
      inject(LogService),
      inject(FileDownloadService),
      inject(ToastService),
      inject(ActivatedRoute),
      inject(AccountService),
      inject(OrganizationService),
    );
  }

  ngOnInit() {
    this.initBase();

    this.route.params
      .pipe(
        map((params) => params.providerId as string),
        distinctUntilChanged(),
        concatMap((providerId) => this.load(providerId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    this.clientsControl.valueChanges
      .pipe(
        map((items) => this.applySelectionLimit(items ?? [])),
        filter((items): items is SelectItemView[] => items != null),
        map((items) => items.map((i) => i.id).sort()),
        distinctUntilChanged((a, b) => a.length === b.length && a.every((id, i) => id === b[i])),
        map((ids) => {
          this.selectedClientIds.set(ids);
          // The shown page belongs to the old selection, so its token can't be continued.
          this.continuationToken = null;
          this.reloadPending.set(true);
        }),
        debounceTime(SELECTION_RELOAD_DEBOUNCE_MS),
        concatMap(() => this.reload()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  /**
   * The base leaves `loading` set when a page request fails, which keeps the "Load more" spinner
   * going. Clear it, and rethrow so `bitAction` shows the error. The shown rows and the
   * continuation token are kept, so the user can try again.
   */
  override loadMoreEvents = () => this.clearLoadingOnFailure(() => this.loadEvents(false));
  override refreshEvents = () => this.clearLoadingOnFailure(() => this.loadEvents(true));

  protected onDatesChanged() {
    this.dirtyDates = true;
    // A token pins the old date range, so paging restarts from the Refresh with the new one.
    this.continuationToken = null;
  }

  protected async requestEvents(
    startDate: string,
    endDate: string,
    continuationToken: string | null,
    purpose: EventsRequestPurpose = "page",
  ): Promise<ListResponse<EventResponse>> {
    const organizationIds =
      continuationToken != null
        ? (this.tokenClientIds.get(continuationToken) ?? this.selectedClientIds())
        : this.selectedClientIds();

    // Never call the endpoint unfiltered: without organizationId it returns every client.
    if (organizationIds.length === 0) {
      return new ListResponse({ data: [], continuationToken: null }, EventResponse);
    }

    let response: ListResponse<EventResponse>;
    try {
      response = await retryOnRateLimit(
        () =>
          this.eventLogApiService.getEventsProviderClients(
            this.providerId,
            organizationIds,
            startDate,
            endDate,
            continuationToken,
          ),
        { maxRetries: purpose === "export" ? EXPORT_MAX_RETRIES : PAGE_MAX_RETRIES },
      );
    } catch (e) {
      // The base export only logs failures (and never downloads a partial file), so say why here.
      if (purpose === "export" && isRateLimitError(e)) {
        this.toastService.showToast({
          variant: "error",
          title: this.i18nService.t("errorOccurred"),
          message: this.i18nService.t("clientEventsExportRateLimited"),
        });
      }
      throw e;
    }

    if (response.continuationToken != null) {
      this.tokenClientIds.set(response.continuationToken, organizationIds);
    }
    await this.users.loadMembersFor(response.data);
    return response;
  }

  protected getUserName(r: EventResponse, userId: string) {
    return this.users.getUser(r, userId);
  }

  protected override getOrganizationName(r: EventResponse): string | undefined {
    return this.clientNames.get(r.organizationId);
  }

  protected override toEventView(r: EventResponse, data: Required<EventView>): EventView {
    return new ClientEventView(
      data,
      r.organizationId,
      this.clientNames.get(r.organizationId) ?? r.organizationId,
    );
  }

  protected clientName(e: EventView): string {
    return e instanceof ClientEventView ? e.clientName : "";
  }

  private async load(providerId: string) {
    this.providerId = providerId;
    this.loaded.set(false);

    const provider = await firstValueFrom(
      this.accountService.activeAccount$.pipe(
        getUserId,
        switchMap((userId) => this.providerService.get$(providerId, userId)),
      ),
    );
    if (provider == null || !provider.useEvents) {
      void this.router.navigate(["/providers", providerId]);
      return;
    }

    try {
      const [organizations] = await Promise.all([
        this.providerApiService.getProviderOrganizations(providerId),
        this.users.loadProviderUsers(providerId),
      ]);

      const clients: SelectItemView[] = organizations.data
        .map((o) => ({
          id: o.organizationId,
          listName: o.organizationName,
          labelName: o.organizationName,
          icon: "bwi-business",
        }))
        .sort(Utils.getSortFunction(this.i18nService, "listName"));
      this.clientNames = new Map(clients.map((c) => [c.id, c.listName]));
      this.clientOptions.set(clients);

      // Everything fits under the limit, so show it all; otherwise let the user choose.
      const defaultSelection = clients.length <= MAX_SELECTED_CLIENTS ? clients : [];
      this.clientsControl.setValue(defaultSelection, { emitEvent: false });
      this.selectedClientIds.set(defaultSelection.map((c) => c.id).sort());

      await this.reload();
    } catch (e) {
      this.logService.error(e);
      this.validationService.showError(e);
    }
    this.loaded.set(true);
  }

  /**
   * Blocks a selection over the limit by restoring the previous one. Returns the accepted
   * selection, or null when it was blocked.
   */
  private applySelectionLimit(items: SelectItemView[]): SelectItemView[] | null {
    if (items.length <= MAX_SELECTED_CLIENTS) {
      return items;
    }
    const selected = new Set(this.selectedClientIds());
    this.clientsControl.setValue(
      this.clientOptions().filter((c) => selected.has(c.id)),
      { emitEvent: false },
    );
    return null;
  }

  private async clearLoadingOnFailure(load: () => Promise<void>) {
    try {
      await load();
    } catch (e) {
      this.loading.set(false);
      throw e;
    }
  }

  /** Reloads from page one for the current selection, or clears the table when nothing is selected. */
  private async reload() {
    try {
      if (this.selectedClientIds().length === 0) {
        this.events.set([]);
        this.continuationToken = null;
        return;
      }
      await this.refreshEvents();
    } catch (e) {
      this.logService.error(e);
      this.validationService.showError(e);
    } finally {
      this.reloadPending.set(false);
      this.loading.set(false);
    }
  }
}
