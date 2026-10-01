import { Injectable } from "@angular/core";
import * as papa from "papaparse";

import { EventView } from "@bitwarden/common/dirt/event-logs";
import { EventExport, EventExportService } from "@bitwarden/web-vault/app/tools/event-export";

import { ClientEventView } from "./client-event.view";

/**
 * The event CSV, with the client name and organization id first. Both columns are always present,
 * even when only one client is selected, so exports can be combined and filtered later.
 */
@Injectable()
export class ClientEventExportService extends EventExportService {
  override async getEventExport(events: EventView[]): Promise<string> {
    return papa.unparse(
      events.map((e) => ({
        clientName: e instanceof ClientEventView ? e.clientName : null,
        organizationId: e instanceof ClientEventView ? e.organizationId : null,
        ...new EventExport(e),
      })),
    );
  }
}
