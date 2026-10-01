import { TestBed } from "@angular/core/testing";
import { mock, MockProxy } from "jest-mock-extended";

import { OrganizationUserApiService } from "@bitwarden/admin-console/common";
import { UserNamePipe } from "@bitwarden/angular/pipes/user-name.pipe";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { EventResponse, EventSystemUser } from "@bitwarden/common/dirt/event-logs";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";

import { ClientEventUsersService } from "./client-event-users.service";

describe("ClientEventUsersService", () => {
  let sut: ClientEventUsersService;
  let apiService: MockProxy<ApiService>;
  let organizationUserApiService: MockProxy<OrganizationUserApiService>;
  let logService: MockProxy<LogService>;

  const event = (fields: Record<string, unknown>) => new EventResponse(fields);

  beforeEach(() => {
    apiService = mock<ApiService>();
    organizationUserApiService = mock<OrganizationUserApiService>();
    logService = mock<LogService>();
    const userNamePipe = mock<UserNamePipe>();
    userNamePipe.transform.mockImplementation((u) => u?.name ?? "");
    const i18nService = mock<I18nService>();
    i18nService.t.mockImplementation((key: string) => key);

    apiService.getProviderUsers.mockResolvedValue({
      data: [{ userId: "provider-user", name: "Pat Provider", email: "pat@msp.com" }],
    } as any);
    organizationUserApiService.getAllMiniUserDetails.mockImplementation(
      async (organizationId: string) =>
        ({
          data: [
            { userId: `${organizationId}-member`, name: `Member of ${organizationId}`, email: "" },
          ],
        }) as any,
    );

    TestBed.configureTestingModule({
      providers: [
        ClientEventUsersService,
        { provide: ApiService, useValue: apiService },
        { provide: OrganizationUserApiService, useValue: organizationUserApiService },
        { provide: UserNamePipe, useValue: userNamePipe },
        { provide: I18nService, useValue: i18nService },
        { provide: LogService, useValue: logService },
      ],
    });
    sut = TestBed.inject(ClientEventUsersService);
  });

  it("resolves an event with providerId from the provider's users", async () => {
    await sut.loadProviderUsers("provider-1");
    const e = event({ organizationId: "org-a", providerId: "provider-1" });
    await sut.loadMembersFor([e]);

    expect(sut.getUser(e, "provider-user")).toEqual({ name: "Pat Provider", email: "pat@msp.com" });
    expect(organizationUserApiService.getAllMiniUserDetails).not.toHaveBeenCalled();
  });

  it("resolves an event without providerId from that client's members", async () => {
    await sut.loadProviderUsers("provider-1");
    const a = event({ organizationId: "org-a" });
    const b = event({ organizationId: "org-b" });
    await sut.loadMembersFor([a, b]);

    expect(sut.getUser(a, "org-a-member")?.name).toBe("Member of org-a");
    expect(sut.getUser(b, "org-b-member")?.name).toBe("Member of org-b");
    // A member of another client isn't a match.
    expect(sut.getUser(a, "org-b-member")).toBeNull();
  });

  it("fetches each client's member list only once", async () => {
    const a1 = event({ organizationId: "org-a" });
    const a2 = event({ organizationId: "org-a" });
    const b = event({ organizationId: "org-b" });

    await Promise.all([sut.loadMembersFor([a1, a2]), sut.loadMembersFor([a1])]);
    await sut.loadMembersFor([a2, b]);

    expect(organizationUserApiService.getAllMiniUserDetails).toHaveBeenCalledTimes(2);
    expect(organizationUserApiService.getAllMiniUserDetails).toHaveBeenCalledWith("org-a");
    expect(organizationUserApiService.getAllMiniUserDetails).toHaveBeenCalledWith("org-b");
  });

  it("falls back to no name when a member lookup fails, without failing", async () => {
    organizationUserApiService.getAllMiniUserDetails.mockRejectedValue(new Error("404"));
    const e = event({ organizationId: "org-a" });

    await expect(sut.loadMembersFor([e])).resolves.toBeUndefined();

    expect(sut.getUser(e, "org-a-member")).toBeNull();
    expect(logService.warning).toHaveBeenCalled();
  });

  it("falls back to no name when the provider user lookup fails, without failing", async () => {
    apiService.getProviderUsers.mockRejectedValue(new Error("500"));

    await expect(sut.loadProviderUsers("provider-1")).resolves.toBeUndefined();

    const e = event({ organizationId: "org-a", providerId: "provider-1" });
    expect(sut.getUser(e, "provider-user")).toBeNull();
  });

  it("labels installations, system users, and machine accounts like the org view", () => {
    expect(sut.getUser(event({ installationId: "inst-1" }), null)?.name).toBe(
      "Installation: inst-1",
    );
    expect(sut.getUser(event({ systemUser: EventSystemUser.PublicApi }), null)?.name).toBe(
      "publicApi",
    );
    expect(sut.getUser(event({ systemUser: EventSystemUser.SCIM }), null)?.name).toBe("SCIM");
    expect(sut.getUser(event({ serviceAccountId: "abcdef123456" }), null)?.name).toBe(
      "machineAccount abcdef12",
    );
  });

  it("returns null for an unknown user so the row shows the unknown label", () => {
    expect(sut.getUser(event({ organizationId: "org-a" }), "someone")).toBeNull();
  });
});
