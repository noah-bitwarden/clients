import { BaseResponse } from "../../../../models/response/base.response";

export class ProviderClientAutoscaleResponse extends BaseResponse {
  autoscaleEnabled: boolean;
  autoscaleSeatLimit?: number;

  constructor(response: any) {
    super(response);
    this.autoscaleEnabled = this.getResponseProperty("AutoscaleEnabled");
    this.autoscaleSeatLimit = this.getResponseProperty("AutoscaleSeatLimit");
  }
}
