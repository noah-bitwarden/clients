import { inject, Injectable } from "@angular/core";

import { OrganizationUserApiService } from "@bitwarden/admin-console/common";
import { UserNamePipe } from "@bitwarden/angular/pipes/user-name.pipe";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { EventResponse, EventSystemUser } from "@bitwarden/common/dirt/event-logs";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { EVENT_SYSTEM_USER_TO_TRANSLATION } from "@bitwarden/web-vault/app/dirt/event-logs";

export type EventUser = { name: string; email?: string };

/**
 * Resolves acting-user names for client events, which span several client organizations.
 *
 * - Events a provider user performed (`providerId` set) resolve from the provider's users, loaded
 *   once by {@link loadProviderUsers}.
 * - Everything else resolves from that client organization's members. Each client's member list is
 *   fetched lazily by {@link loadMembersFor} the first time one of its events is shown, then cached
 *   for the life of the service, which is scoped to the view.
 *
 * A failed lookup is logged and treated as "no users", so the row falls back to "unknown" rather
 * than failing the page.
 */
@Injectable()
export class ClientEventUsersService {
  private readonly apiService = inject(ApiService);
  private readonly organizationUserApiService = inject(OrganizationUserApiService);
  private readonly userNamePipe = inject(UserNamePipe);
  private readonly i18nService = inject(I18nService);
  private readonly logService = inject(LogService);

  private providerUsers = new Map<string, EventUser>();
  /** In-flight or finished member fetches, keyed by organization id, so each runs only once. */
  private readonly memberRequests = new Map<string, Promise<void>>();
  private readonly members = new Map<string, Map<string, EventUser>>();

  async loadProviderUsers(providerId: string): Promise<void> {
    try {
      const response = await this.apiService.getProviderUsers(providerId);
      this.providerUsers = new Map(
        response.data.map((u) => [
          u.userId,
          { name: this.userNamePipe.transform(u), email: u.email },
        ]),
      );
    } catch (e) {
      this.logService.warning(e);
    }
  }

  /** Loads the member lists needed to name the acting users of `events`. */
  async loadMembersFor(events: EventResponse[]): Promise<void> {
    const organizationIds = new Set(
      events
        .filter((e) => e.providerId == null && e.organizationId != null)
        .map((e) => e.organizationId),
    );
    await Promise.all([...organizationIds].map((id) => this.loadMembers(id)));
  }

  getUser(r: EventResponse, userId: string | null): EventUser | null {
    if (r.installationId != null) {
      return { name: `Installation: ${r.installationId}` };
    }

    if (userId != null) {
      const user =
        r.providerId != null
          ? this.providerUsers.get(userId)
          : this.members.get(r.organizationId)?.get(userId);
      if (user != null) {
        return user;
      }
    }

    if (r.systemUser != null) {
      const systemUserI18nKey = EVENT_SYSTEM_USER_TO_TRANSLATION[r.systemUser];
      return {
        name: systemUserI18nKey
          ? this.i18nService.t(systemUserI18nKey)
          : EventSystemUser[r.systemUser],
      };
    }

    if (r.serviceAccountId) {
      return {
        name: this.i18nService.t("machineAccount") + " " + r.serviceAccountId.substring(0, 8),
      };
    }

    return null;
  }

  private loadMembers(organizationId: string): Promise<void> {
    let request = this.memberRequests.get(organizationId);
    if (request == null) {
      request = this.fetchMembers(organizationId);
      this.memberRequests.set(organizationId, request);
    }
    return request;
  }

  private async fetchMembers(organizationId: string): Promise<void> {
    try {
      const response = await this.organizationUserApiService.getAllMiniUserDetails(organizationId);
      this.members.set(
        organizationId,
        new Map(
          response.data.map((u) => [
            u.userId,
            { name: this.userNamePipe.transform(u), email: u.email },
          ]),
        ),
      );
    } catch (e) {
      this.logService.warning(e);
    }
  }
}
