import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";

import { FeatureFlag } from "@bitwarden/common/enums/feature-flag.enum";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { HeaderModule } from "@bitwarden/web-vault/app/layouts/header/header.module";
import { SharedModule } from "@bitwarden/web-vault/app/shared";

/**
 * The Provider Portal event log page. Hosts the Provider events and Client events tabs as child
 * routes; with client events off, it renders the header and the provider events alone, as before.
 */
@Component({
  selector: "provider-event-logs",
  templateUrl: "provider-event-logs.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedModule, HeaderModule],
})
export class ProviderEventLogsComponent {
  protected readonly clientEventsEnabled = toSignal(
    inject(ConfigService).getFeatureFlag$(FeatureFlag.ProviderClientEvents),
    { initialValue: false },
  );
}
