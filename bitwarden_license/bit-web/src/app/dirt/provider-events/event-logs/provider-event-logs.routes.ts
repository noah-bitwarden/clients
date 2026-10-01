import { Routes } from "@angular/router";

import { canAccessFeature } from "@bitwarden/angular/platform/guard/feature-flag.guard";
import { FeatureFlag } from "@bitwarden/common/enums/feature-flag.enum";

import { ClientEventsComponent } from "../client-events/client-events.component";
import { EventsComponent } from "../events.component";

/**
 * Tabs of the Provider Portal event log page. `events` itself lands on Provider events, so
 * existing links keep working; Client events is behind its feature flag.
 */
export const providerEventLogsChildRoutes: Routes = [
  { path: "", pathMatch: "full", redirectTo: "provider" },
  {
    path: "provider",
    component: EventsComponent,
    data: {
      titleId: "eventLogs",
    },
  },
  {
    path: "clients",
    component: ClientEventsComponent,
    canActivate: [canAccessFeature(FeatureFlag.ProviderClientEvents)],
    data: {
      titleId: "eventLogs",
    },
  },
];
