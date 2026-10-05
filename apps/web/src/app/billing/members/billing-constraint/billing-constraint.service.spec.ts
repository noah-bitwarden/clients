import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { of } from "rxjs";

import { ProviderType } from "@bitwarden/common/admin-console/enums";
import { Organization } from "@bitwarden/common/admin-console/models/domain/organization";
import { OrganizationMetadataServiceAbstraction } from "@bitwarden/common/billing/abstractions/organization-metadata.service.abstraction";
import { ProductTierType } from "@bitwarden/common/billing/enums";
import { OrganizationBillingMetadataResponse } from "@bitwarden/common/billing/models/response/organization-billing-metadata.response";
import { FeatureFlag } from "@bitwarden/common/enums/feature-flag.enum";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { OrganizationId } from "@bitwarden/common/types/guid";
import { DialogService, ToastService } from "@bitwarden/components";

import {
  ChangePlanDialogResultType,
  openChangePlanDialog,
} from "../../organizations/change-plan-dialog.component";

import { BillingConstraintService, SeatLimitResult } from "./billing-constraint.service";

jest.mock("../../organizations/change-plan-dialog.component");

describe("BillingConstraintService", () => {
  let service: BillingConstraintService;
  let i18nService: jest.Mocked<I18nService>;
  let dialogService: jest.Mocked<DialogService>;
  let toastService: jest.Mocked<ToastService>;
  let router: jest.Mocked<Router>;
  let organizationMetadataService: jest.Mocked<OrganizationMetadataServiceAbstraction>;
  let configService: jest.Mocked<ConfigService>;

  const mockOrganizationId = "org-123" as OrganizationId;

  const createMockOrganization = (overrides: Partial<Organization> = {}): Organization => {
    const org = new Organization();
    org.id = mockOrganizationId;
    org.seats = 10;
    org.productTierType = ProductTierType.Teams;

    Object.defineProperty(org, "hasReseller", {
      value: false,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(org, "hasBillableProvider", {
      value: false,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(org, "canEditSubscription", {
      value: true,
      writable: true,
      configurable: true,
    });

    return Object.assign(org, overrides);
  };

  const createMockBillingMetadata = (
    overrides: Partial<OrganizationBillingMetadataResponse> = {},
  ): OrganizationBillingMetadataResponse => {
    return {
      organizationOccupiedSeats: 5,
      ...overrides,
    } as OrganizationBillingMetadataResponse;
  };

  beforeEach(() => {
    const mockDialogRef = {
      closed: of(true),
    };

    const mockSimpleDialogRef = {
      closed: of(true),
    };

    i18nService = {
      t: jest.fn().mockReturnValue("translated-text"),
    } as any;

    dialogService = {
      openSimpleDialogRef: jest.fn().mockReturnValue(mockSimpleDialogRef),
    } as any;

    toastService = {
      showToast: jest.fn(),
    } as any;

    router = {
      navigate: jest.fn().mockResolvedValue(true),
    } as any;

    organizationMetadataService = {
      getOrganizationMetadata$: jest.fn(),
      refreshMetadataCache: jest.fn(),
    } as any;

    configService = {
      getFeatureFlag: jest.fn().mockResolvedValue(false),
    } as any;

    (openChangePlanDialog as jest.Mock).mockReturnValue(mockDialogRef);

    TestBed.configureTestingModule({
      providers: [
        BillingConstraintService,
        { provide: I18nService, useValue: i18nService },
        { provide: DialogService, useValue: dialogService },
        { provide: ToastService, useValue: toastService },
        { provide: Router, useValue: router },
        { provide: OrganizationMetadataServiceAbstraction, useValue: organizationMetadataService },
        { provide: ConfigService, useValue: configService },
      ],
    });

    service = TestBed.inject(BillingConstraintService);
  });

  describe("checkSeatLimit", () => {
    it("should allow users when occupied seats are less than total seats", async () => {
      const organization = createMockOrganization({ seats: 10 });
      const billingMetadata = createMockBillingMetadata({ organizationOccupiedSeats: 5 });

      const result = await service.checkSeatLimit(organization, billingMetadata);

      expect(result).toEqual({ canAddUsers: true });
    });

    it("should allow users when occupied seats equal total seats for non-fixed seat plans", async () => {
      const organization = createMockOrganization({
        seats: 10,
        productTierType: ProductTierType.Teams,
      });
      const billingMetadata = createMockBillingMetadata({ organizationOccupiedSeats: 10 });

      const result = await service.checkSeatLimit(organization, billingMetadata);

      expect(result).toEqual({ canAddUsers: true });
    });

    it("should block users with provider-limit reason when organization has reseller", async () => {
      const organization = createMockOrganization({
        seats: 10,
        hasReseller: true,
      });
      const billingMetadata = createMockBillingMetadata({ organizationOccupiedSeats: 10 });

      const result = await service.checkSeatLimit(organization, billingMetadata);

      expect(result).toEqual({
        canAddUsers: false,
        reason: "provider-limit",
      });
    });

    it("should block users with provider-limit reason when organization has a billable provider", async () => {
      const organization = createMockOrganization({
        seats: 10,
        hasBillableProvider: true,
      });
      const billingMetadata = createMockBillingMetadata({ organizationOccupiedSeats: 10 });

      const result = await service.checkSeatLimit(organization, billingMetadata);

      expect(result).toEqual({
        canAddUsers: false,
        reason: "provider-limit",
      });
    });

    it("should block users with fixed-seat-limit reason for fixed seat plans", async () => {
      const organization = createMockOrganization({
        seats: 10,
        productTierType: ProductTierType.Free,
        canEditSubscription: true,
      });
      const billingMetadata = createMockBillingMetadata({ organizationOccupiedSeats: 10 });

      const result = await service.checkSeatLimit(organization, billingMetadata);

      expect(result).toEqual({
        canAddUsers: false,
        reason: "fixed-seat-limit",
        shouldShowUpgradeDialog: true,
      });
    });

    it("should not show upgrade dialog when organization cannot edit subscription", async () => {
      const organization = createMockOrganization({
        seats: 10,
        productTierType: ProductTierType.TeamsStarter,
        canEditSubscription: false,
      });
      const billingMetadata = createMockBillingMetadata({ organizationOccupiedSeats: 10 });

      const result = await service.checkSeatLimit(organization, billingMetadata);

      expect(result).toEqual({
        canAddUsers: false,
        reason: "fixed-seat-limit",
        shouldShowUpgradeDialog: false,
      });
    });

    it("shoud throw if missing billingMetadata", async () => {
      const organization = createMockOrganization({ seats: 10 });
      const billingMetadata = createMockBillingMetadata({
        organizationOccupiedSeats: undefined as any,
      });

      await expect(service.checkSeatLimit(organization, billingMetadata)).rejects.toThrow(
        "Cannot check seat limit: billingMetadata is null or undefined.",
      );
    });

    describe("provider client seat autoscale", () => {
      const atLimit = createMockBillingMetadata({ organizationOccupiedSeats: 10 });

      const enableAutoscaleFlag = () =>
        configService.getFeatureFlag.mockImplementation(
          async (flag) => flag === FeatureFlag.PM18793_ProviderClientSeatAutoscale,
        );

      it("lets the request reach the server for an MSP-managed org when the flag is on", async () => {
        enableAutoscaleFlag();
        const organization = createMockOrganization({
          hasBillableProvider: true,
          providerType: ProviderType.Msp,
        });

        const result = await service.checkSeatLimit(organization, atLimit);

        expect(result).toEqual({ canAddUsers: true });
        expect(configService.getFeatureFlag).toHaveBeenCalledWith(
          FeatureFlag.PM18793_ProviderClientSeatAutoscale,
        );
      });

      it("keeps the block for an MSP-managed org when the flag is off", async () => {
        const organization = createMockOrganization({
          hasBillableProvider: true,
          providerType: ProviderType.Msp,
        });

        const result = await service.checkSeatLimit(organization, atLimit);

        expect(result).toEqual({ canAddUsers: false, reason: "provider-limit" });
      });

      it("keeps the block for a Reseller-managed org when the flag is on", async () => {
        enableAutoscaleFlag();
        const organization = createMockOrganization({
          hasReseller: true,
          providerType: ProviderType.Reseller,
        });

        const result = await service.checkSeatLimit(organization, atLimit);

        expect(result).toEqual({ canAddUsers: false, reason: "provider-limit" });
      });

      it("keeps the block for a BusinessUnit-managed org when the flag is on", async () => {
        enableAutoscaleFlag();
        const organization = createMockOrganization({
          hasBillableProvider: true,
          providerType: ProviderType.BusinessUnit,
        });

        const result = await service.checkSeatLimit(organization, atLimit);

        expect(result).toEqual({ canAddUsers: false, reason: "provider-limit" });
      });

      it("leaves a non-provider fixed-seat org unchanged when the flag is on", async () => {
        enableAutoscaleFlag();
        const organization = createMockOrganization({
          productTierType: ProductTierType.Free,
          canEditSubscription: true,
        });

        const result = await service.checkSeatLimit(organization, atLimit);

        expect(result).toEqual({
          canAddUsers: false,
          reason: "fixed-seat-limit",
          shouldShowUpgradeDialog: true,
        });
      });

      it("doesn't read the flag when the org has seats available", async () => {
        const organization = createMockOrganization({
          hasBillableProvider: true,
          providerType: ProviderType.Msp,
        });

        await service.checkSeatLimit(
          organization,
          createMockBillingMetadata({ organizationOccupiedSeats: 5 }),
        );

        expect(configService.getFeatureFlag).not.toHaveBeenCalled();
      });
    });
  });

  describe("seatLimitReached", () => {
    it("should return false when canAddUsers is true", async () => {
      const result: SeatLimitResult = { canAddUsers: true };
      const organization = createMockOrganization();

      const seatLimitReached = await service.seatLimitReached(result, organization);

      expect(seatLimitReached).toBe(false);
    });

    it("should show toast and return true for provider-limit", async () => {
      const result: SeatLimitResult = { canAddUsers: false, reason: "provider-limit" };
      const organization = createMockOrganization({ seats: 10 });

      const seatLimitReached = await service.seatLimitReached(result, organization);

      expect(toastService.showToast).toHaveBeenCalledWith({
        variant: "error",
        title: "translated-text",
        message: "translated-text",
      });
      expect(i18nService.t).toHaveBeenCalledWith("errorOccurred");
      expect(i18nService.t).toHaveBeenCalledWith("seatLimitReachedContactProvider", 10);
      expect(seatLimitReached).toBe(true);
    });

    it("should open the change-plan dialog on invite when the admin can manage billing", async () => {
      const result: SeatLimitResult = {
        canAddUsers: false,
        reason: "fixed-seat-limit",
        shouldShowUpgradeDialog: true,
      };
      const organization = createMockOrganization({
        canEditSubscription: true,
        seats: 10,
      });
      const mockDialogRef = { closed: of(ChangePlanDialogResultType.Closed) };
      (openChangePlanDialog as jest.Mock).mockReturnValue(mockDialogRef);

      const seatLimitReached = await service.seatLimitReached(result, organization, "invite");

      expect(openChangePlanDialog).toHaveBeenCalledWith(dialogService, {
        data: {
          organizationId: organization.id,
          productTierType: organization.productTierType,
        },
      });
      expect(toastService.showToast).not.toHaveBeenCalled();
      expect(seatLimitReached).toBe(true);
    });

    it("should not block the invite when the change-plan dialog is submitted", async () => {
      const result: SeatLimitResult = {
        canAddUsers: false,
        reason: "fixed-seat-limit",
        shouldShowUpgradeDialog: true,
      };
      const organization = createMockOrganization({ canEditSubscription: true, seats: 10 });
      const mockDialogRef = { closed: of(ChangePlanDialogResultType.Submitted) };
      (openChangePlanDialog as jest.Mock).mockReturnValue(mockDialogRef);

      const seatLimitReached = await service.seatLimitReached(result, organization, "invite");

      expect(seatLimitReached).toBe(false);
    });

    it("should show a contact-owner toast on invite when the admin cannot manage billing", async () => {
      const result: SeatLimitResult = {
        canAddUsers: false,
        reason: "fixed-seat-limit",
        shouldShowUpgradeDialog: false,
      };
      const organization = createMockOrganization({
        canEditSubscription: false,
        seats: 10,
      });

      const seatLimitReached = await service.seatLimitReached(result, organization, "invite");

      expect(toastService.showToast).toHaveBeenCalledWith({
        variant: "error",
        title: "translated-text",
        message: "translated-text",
      });
      expect(i18nService.t).toHaveBeenCalledWith("errorOccurred");
      expect(i18nService.t).toHaveBeenCalledWith("seatLimitReachedContactOwner", 10);
      expect(dialogService.openSimpleDialogRef).not.toHaveBeenCalled();
      expect(seatLimitReached).toBe(true);
    });

    it("should return true when the restore change-plan dialog is cancelled", async () => {
      const result: SeatLimitResult = {
        canAddUsers: false,
        reason: "fixed-seat-limit",
        shouldShowUpgradeDialog: true,
      };
      const organization = createMockOrganization();
      const mockDialogRef = { closed: of(ChangePlanDialogResultType.Closed) };
      (openChangePlanDialog as jest.Mock).mockReturnValue(mockDialogRef);

      const seatLimitReached = await service.seatLimitReached(result, organization, "restore");

      expect(openChangePlanDialog).toHaveBeenCalledWith(dialogService, {
        data: {
          organizationId: organization.id,
          productTierType: organization.productTierType,
        },
      });
      expect(seatLimitReached).toBe(true);
    });

    it("should return false when the restore change-plan dialog is submitted", async () => {
      const result: SeatLimitResult = {
        canAddUsers: false,
        reason: "fixed-seat-limit",
        shouldShowUpgradeDialog: true,
      };
      const organization = createMockOrganization();
      const mockDialogRef = { closed: of(ChangePlanDialogResultType.Submitted) };
      (openChangePlanDialog as jest.Mock).mockReturnValue(mockDialogRef);

      const seatLimitReached = await service.seatLimitReached(result, organization, "restore");

      expect(seatLimitReached).toBe(false);
    });

    it("should show seat limit restore dialog when shouldShowUpgradeDialog is false", async () => {
      const result: SeatLimitResult = {
        canAddUsers: false,
        reason: "fixed-seat-limit",
        shouldShowUpgradeDialog: false,
      };
      const organization = createMockOrganization({
        canEditSubscription: false,
        productTierType: ProductTierType.Free,
      });

      const seatLimitReached = await service.seatLimitReached(result, organization, "restore");

      expect(dialogService.openSimpleDialogRef).toHaveBeenCalled();
      expect(seatLimitReached).toBe(true);
    });

    it("should return true for unknown reasons", async () => {
      const result: SeatLimitResult = { canAddUsers: false };
      const organization = createMockOrganization();

      const seatLimitReached = await service.seatLimitReached(result, organization);

      expect(seatLimitReached).toBe(true);
    });

    it("should use restore-specific content and title when action is 'restore'", async () => {
      const result: SeatLimitResult = {
        canAddUsers: false,
        reason: "fixed-seat-limit",
        shouldShowUpgradeDialog: false,
      };
      const organization = createMockOrganization({
        productTierType: ProductTierType.Free,
        canEditSubscription: false,
        seats: 5,
      });

      await service.seatLimitReached(result, organization, "restore");

      expect(i18nService.t).toHaveBeenCalledWith("cannotRestoreAccessError");
      expect(i18nService.t).toHaveBeenCalledWith("freeOrgRestoreLimitReachedNoManageBilling", 5);
      expect(i18nService.t).not.toHaveBeenCalledWith("upgradeOrganization");
      expect(i18nService.t).not.toHaveBeenCalledWith(
        "seatLimitReachedContactOwner",
        expect.anything(),
      );
    });

    it("should default to the invite toast behavior when no action is provided", async () => {
      const result: SeatLimitResult = {
        canAddUsers: false,
        reason: "fixed-seat-limit",
        shouldShowUpgradeDialog: false,
      };
      const organization = createMockOrganization({
        productTierType: ProductTierType.Free,
        canEditSubscription: false,
        seats: 5,
      });

      await service.seatLimitReached(result, organization);

      expect(i18nService.t).toHaveBeenCalledWith("seatLimitReachedContactOwner", 5);
      expect(dialogService.openSimpleDialogRef).not.toHaveBeenCalled();
      expect(i18nService.t).not.toHaveBeenCalledWith("cannotRestoreAccessError");
    });
  });

  describe("navigateToPaymentMethod", () => {
    it("should navigate to payment method with correct parameters", async () => {
      const organization = createMockOrganization();

      await service.navigateToPaymentMethod(organization);

      expect(router.navigate).toHaveBeenCalledWith(
        ["organizations", organization.id, "billing", "payment-method"],
        {
          state: { launchPaymentModalAutomatically: true },
        },
      );
    });
  });

  describe("private methods through public method coverage", () => {
    describe("getDialogContent via showSeatLimitReachedDialog", () => {
      it("should get correct dialog content for Free organization", async () => {
        const result: SeatLimitResult = {
          canAddUsers: false,
          reason: "fixed-seat-limit",
          shouldShowUpgradeDialog: false,
        };
        const organization = createMockOrganization({
          productTierType: ProductTierType.Free,
          canEditSubscription: false,
          seats: 5,
        });

        await service.seatLimitReached(result, organization, "restore");

        expect(i18nService.t).toHaveBeenCalledWith("freeOrgRestoreLimitReachedNoManageBilling", 5);
      });

      it("should get correct dialog content for TeamsStarter organization", async () => {
        const result: SeatLimitResult = {
          canAddUsers: false,
          reason: "fixed-seat-limit",
          shouldShowUpgradeDialog: false,
        };
        const organization = createMockOrganization({
          productTierType: ProductTierType.TeamsStarter,
          canEditSubscription: false,
          seats: 3,
        });

        await service.seatLimitReached(result, organization, "restore");

        expect(i18nService.t).toHaveBeenCalledWith(
          "teamsStarterPlanRestoreLimitReachedNoManageBilling",
          3,
        );
      });

      it("should get correct dialog content for Families organization", async () => {
        const result: SeatLimitResult = {
          canAddUsers: false,
          reason: "fixed-seat-limit",
          shouldShowUpgradeDialog: false,
        };
        const organization = createMockOrganization({
          productTierType: ProductTierType.Families,
          canEditSubscription: false,
          seats: 6,
        });

        await service.seatLimitReached(result, organization, "restore");

        expect(i18nService.t).toHaveBeenCalledWith(
          "familiesPlanRestoreLimitReachedNoManageBilling",
          6,
        );
      });

      it("should throw error for unsupported product type in getProductKey", async () => {
        const result: SeatLimitResult = {
          canAddUsers: false,
          reason: "fixed-seat-limit",
          shouldShowUpgradeDialog: false,
        };
        const organization = createMockOrganization({
          productTierType: ProductTierType.Enterprise,
          canEditSubscription: false,
        });

        await expect(service.seatLimitReached(result, organization, "restore")).rejects.toThrow(
          `Unsupported product type: ${ProductTierType.Enterprise}`,
        );
      });

      it("should get correct restore dialog content for TeamsStarter organization", async () => {
        const result: SeatLimitResult = {
          canAddUsers: false,
          reason: "fixed-seat-limit",
          shouldShowUpgradeDialog: false,
        };
        const organization = createMockOrganization({
          productTierType: ProductTierType.TeamsStarter,
          canEditSubscription: false,
          seats: 3,
        });

        await service.seatLimitReached(result, organization, "restore");

        expect(i18nService.t).toHaveBeenCalledWith(
          "teamsStarterPlanRestoreLimitReachedNoManageBilling",
          3,
        );
      });

      it("should get correct restore dialog content for Families organization", async () => {
        const result: SeatLimitResult = {
          canAddUsers: false,
          reason: "fixed-seat-limit",
          shouldShowUpgradeDialog: false,
        };
        const organization = createMockOrganization({
          productTierType: ProductTierType.Families,
          canEditSubscription: false,
          seats: 6,
        });

        await service.seatLimitReached(result, organization, "restore");

        expect(i18nService.t).toHaveBeenCalledWith(
          "familiesPlanRestoreLimitReachedNoManageBilling",
          6,
        );
      });
    });

    describe("getAcceptButtonText via showSeatLimitReachedDialog", () => {
      it("should return 'ok' when organization cannot edit subscription", async () => {
        const result: SeatLimitResult = {
          canAddUsers: false,
          reason: "fixed-seat-limit",
          shouldShowUpgradeDialog: false,
        };
        const organization = createMockOrganization({
          canEditSubscription: false,
          productTierType: ProductTierType.Free,
        });

        await service.seatLimitReached(result, organization, "restore");

        expect(i18nService.t).toHaveBeenCalledWith("ok");
      });

      it("should return 'upgrade' when organization can edit subscription", async () => {
        const result: SeatLimitResult = {
          canAddUsers: false,
          reason: "fixed-seat-limit",
          shouldShowUpgradeDialog: false,
        };
        const organization = createMockOrganization({
          canEditSubscription: true,
          productTierType: ProductTierType.Free,
        });
        const mockSimpleDialogRef = { closed: of(false) };
        dialogService.openSimpleDialogRef.mockReturnValue(mockSimpleDialogRef);

        await service.seatLimitReached(result, organization, "restore");

        expect(i18nService.t).toHaveBeenCalledWith("upgrade");
      });

      it("should throw error for unsupported product type in getAcceptButtonText", async () => {
        const result: SeatLimitResult = {
          canAddUsers: false,
          reason: "fixed-seat-limit",
          shouldShowUpgradeDialog: false,
        };
        const organization = createMockOrganization({
          canEditSubscription: true,
          productTierType: ProductTierType.Enterprise,
        });

        await expect(service.seatLimitReached(result, organization, "restore")).rejects.toThrow(
          `Unsupported product type: ${ProductTierType.Enterprise}`,
        );
      });
    });

    describe("handleUpgradeNavigation", () => {
      it("should navigate to billing subscription with upgrade query param", async () => {
        const result: SeatLimitResult = {
          canAddUsers: false,
          reason: "fixed-seat-limit",
          shouldShowUpgradeDialog: false,
        };
        const organization = createMockOrganization({
          canEditSubscription: true,
          productTierType: ProductTierType.Free,
        });
        const mockSimpleDialogRef = { closed: of(true) };
        dialogService.openSimpleDialogRef.mockReturnValue(mockSimpleDialogRef);

        await service.seatLimitReached(result, organization, "restore");

        expect(router.navigate).toHaveBeenCalledWith(
          ["/organizations", organization.id, "billing", "subscription"],
          { queryParams: { upgrade: true } },
        );
      });

      it("should throw error for non-self-upgradable product type", async () => {
        const result: SeatLimitResult = {
          canAddUsers: false,
          reason: "fixed-seat-limit",
          shouldShowUpgradeDialog: false,
        };
        const organization = createMockOrganization({
          canEditSubscription: true,
          productTierType: ProductTierType.Enterprise,
        });
        const mockSimpleDialogRef = { closed: of(true) };
        dialogService.openSimpleDialogRef.mockReturnValue(mockSimpleDialogRef);

        await expect(service.seatLimitReached(result, organization, "restore")).rejects.toThrow(
          `Unsupported product type: ${ProductTierType.Enterprise}`,
        );
      });
    });
  });
});
