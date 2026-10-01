import { EventView } from "@bitwarden/common/dirt/event-logs";

/** An event row from the provider's client events, tagged with the client organization it came from. */
export class ClientEventView extends EventView {
  organizationId: string;
  clientName: string;

  constructor(data: Required<EventView>, organizationId: string, clientName: string) {
    super(data);
    this.organizationId = organizationId;
    this.clientName = clientName;
  }
}
