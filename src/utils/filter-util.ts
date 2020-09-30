import { Logger } from "winston";
import IHullSegment from "../types/hull-segment";
import IHullAccountUpdateMessage from "../types/account-update-message";
import {
  OutgoingOperationEnvelopesFiltered,
  Schema$ZohoUpsertObject,
} from "../core/service-objects";
import { get, intersection } from "lodash";
import {
  VALIDATION_SKIP_HULLOBJECT_NOTINANYSEGMENT,
  VALIDATION_SKIP_HULLACCOUNT_NODOMAIN,
  VALIDATION_SKIP_HULLACCOUNT_NOREGNO,
} from "../core/messages";
import { PrivateSettings } from "../core/connector";
import IHullUserUpdateMessage from "../types/user-update-message";

export class FilterUtil {
  public readonly privateSettings: PrivateSettings;
  public readonly logger: Logger;

  constructor(options: any) {
    this.privateSettings = options.hullAppSettings;
    this.logger = options.logger;
  }

  public filterUserMessagesInitial(
    messages: IHullUserUpdateMessage[],
    isBatch: boolean = false,
  ): OutgoingOperationEnvelopesFiltered<
    IHullUserUpdateMessage,
    Schema$ZohoUpsertObject
  > {
    const result: OutgoingOperationEnvelopesFiltered<
      IHullUserUpdateMessage,
      Schema$ZohoUpsertObject
    > = {
      upserts: [],
      skips: [],
    };

    messages.forEach((msg) => {
      if (
        !isBatch &&
        !FilterUtil.isInAnySegment(
          msg.segments,
          this.privateSettings.lead_synchronized_segments || [],
        ) &&
        !FilterUtil.isInAnySegment(
          msg.segments,
          this.privateSettings.contact_synchronized_segments || [],
        )
      ) {
        result.skips.push({
          message: msg,
          operation: "skip",
          notes: [VALIDATION_SKIP_HULLOBJECT_NOTINANYSEGMENT("user")],
          objectType: "user",
        });
      } else if (
        !isBatch &&
        FilterUtil.isInAnySegment(
          msg.segments,
          this.privateSettings.lead_synchronized_segments || [],
        )
      ) {
        // Handle leads
        result.upserts.push({
          message: msg,
          operation: "upsert",
          objectType: "user",
          serviceObject: {
            module: "Leads",
            data: {},
          },
        });
      } else if (
        !isBatch &&
        FilterUtil.isInAnySegment(
          msg.segments,
          this.privateSettings.contact_synchronized_segments || [],
        )
      ) {
        // Handle contacts
        result.upserts.push({
          message: msg,
          operation: "upsert",
          objectType: "user",
          serviceObject: {
            module: "Contacts",
            data: {},
          },
        });
      } else {
        // Handle batch according to the settings
        result.upserts.push({
          message: msg,
          operation: "upsert",
          objectType: "user",
          serviceObject: {
            module: this.privateSettings.batch_users_module || "Leads",
            data: {},
          },
        });
      }
    });

    return result;
  }

  public filterAccountMessagesInitial(
    messages: IHullAccountUpdateMessage[],
    isBatch: boolean = false,
  ): OutgoingOperationEnvelopesFiltered<
    IHullAccountUpdateMessage,
    Schema$ZohoUpsertObject
  > {
    const result: OutgoingOperationEnvelopesFiltered<
      IHullAccountUpdateMessage,
      Schema$ZohoUpsertObject
    > = {
      upserts: [],
      skips: [],
    };

    messages.forEach((msg) => {
      if (
        !isBatch &&
        !FilterUtil.isInAnySegment(
          msg.account_segments,
          this.privateSettings.account_synchronized_segments || [],
        )
      ) {
        result.skips.push({
          message: msg,
          operation: "skip",
          notes: [VALIDATION_SKIP_HULLOBJECT_NOTINANYSEGMENT("account")],
          objectType: "account",
        });
      } else {
        result.upserts.push({
          message: msg,
          operation: "upsert",
          objectType: "account",
          serviceObject: {
            module: "Accounts",
            data: {},
          },
        });
      }
    });

    return result;
  }

  private static isInAnySegment(
    actualSegments: IHullSegment[],
    whitelistedSegments: string[],
  ): boolean {
    const actualIds = actualSegments.map((s) => s.id);
    if (intersection(actualIds, whitelistedSegments).length === 0) {
      return false;
    }

    return true;
  }
}
