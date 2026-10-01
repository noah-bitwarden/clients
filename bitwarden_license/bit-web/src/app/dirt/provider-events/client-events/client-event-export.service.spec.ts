import * as papa from "papaparse";

import { EventType, EventView } from "@bitwarden/common/dirt/event-logs";

import { ClientEventExportService } from "./client-event-export.service";
import { ClientEventView } from "./client-event.view";

describe("ClientEventExportService", () => {
  const sut = new ClientEventExportService();

  const view = (organizationId: string, clientName: string) =>
    new ClientEventView(
      {
        message: "<b>Logged in</b>",
        humanReadableMessage: "Logged in",
        appIcon: "bwi-globe",
        appName: "Web vault",
        userId: "user-1",
        actingUserId: "user-1",
        userName: "Pat",
        userEmail: "pat@example.com",
        date: "2026-09-29T12:00:00Z",
        ip: "127.0.0.1",
        type: EventType.User_LoggedIn,
      } as Required<EventView>,
      organizationId,
      clientName,
    );

  const parse = (csv: string) => papa.parse<Record<string, string>>(csv, { header: true });

  it("always includes the client name and organization id columns first, even for one client", async () => {
    const csv = await sut.getEventExport([view("org-a", "Acme")]);
    const { data, meta } = parse(csv);

    expect(meta.fields?.slice(0, 2)).toEqual(["clientName", "organizationId"]);
    expect(meta.fields).toEqual(expect.arrayContaining(["message", "userName", "date", "type"]));
    expect(data[0]).toMatchObject({
      clientName: "Acme",
      organizationId: "org-a",
      message: "Logged in",
      type: "User_LoggedIn",
    });
  });

  it("writes one row per event with that event's client", async () => {
    const csv = await sut.getEventExport([view("org-a", "Acme"), view("org-b", "Globex")]);

    expect(parse(csv).data.map((r) => r.clientName)).toEqual(["Acme", "Globex"]);
  });
});
