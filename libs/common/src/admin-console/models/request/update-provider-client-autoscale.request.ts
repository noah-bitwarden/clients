export class UpdateProviderClientAutoscaleRequest {
  enabled: boolean;
  seatLimit: number | null;

  constructor(c: { enabled: boolean; seatLimit: number | null }) {
    this.enabled = c.enabled;
    this.seatLimit = c.seatLimit;
  }
}
