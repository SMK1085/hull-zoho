import { AwilixContainer, asClass, asValue } from "awilix";
import { ServiceClient } from "./service-client";
import { LoggingUtil } from "../utils/logging-util";
import { FilterUtil } from "../utils/filter-util";
import { MappingUtil } from "../utils/mapping-util";
import { ConnectorStatusResponse } from "../types/connector-status";
import { Logger } from "winston";
import { PrivateSettings } from "./connector";
import IHullClient from "../types/hull-client";
import { isNil, cloneDeep, forEach, pick, get, set, first } from "lodash";
import {
  STATUS_SETUPREQUIRED_NOAPIKEY,
  ERROR_UNHANDLED_GENERIC,
} from "./messages";
import { ConnectorRedisClient } from "../utils/redis-client";
import IHullAccountUpdateMessage from "../types/account-update-message";
import asyncForEach from "../utils/async-foreach";
import {
  Schema$ZohoNotification,
  Schema$ZohoRecord,
  ZohoOAuthResponse,
  Schema$ZohoNotificationRequest,
  Schema$ZohoModule,
} from "./service-objects";
import { FieldsSchema } from "../types/fields-schema";
import { AuthStatus } from "../types/auth-status";
import { DateTime } from "luxon";
import { CachingUtil } from "../utils/caching-util";
import qs from "qs";
import IHullUserUpdateMessage from "../types/user-update-message";
import { response } from "express";

export class SyncAgent {
  public readonly diContainer: AwilixContainer;

  constructor(container: AwilixContainer) {
    this.diContainer = container;
    const hullAppSettings = this.diContainer.resolve<PrivateSettings>(
      "hullAppSettings",
    );

    this.diContainer.register(
      "accessToken",
      asValue(hullAppSettings.access_token || "unknown"),
    );
    this.diContainer.register(
      "apiDomain",
      asValue(hullAppSettings.api_domain || "unknown"),
    );

    this.diContainer.register("serviceClient", asClass(ServiceClient));
    this.diContainer.register("loggingUtil", asClass(LoggingUtil));
    this.diContainer.register("filterUtil", asClass(FilterUtil));
    this.diContainer.register("mappingUtil", asClass(MappingUtil));
  }

  /**
   * Processes outgoing notifications for user:update lane.
   *
   * @param {IHullUserUpdateMessage[]} messages The notification messages.
   * @param {boolean} [isBatch=false] `True` if it is a batch; otherwise `false`.
   * @returns {Promise<void>} An awaitable Promise.
   * @memberof SyncAgent
   */
  public async sendUserMessages(
    messages: IHullUserUpdateMessage[],
    isBatch = false,
  ): Promise<void> {
    const logger = this.diContainer.resolve<Logger>("logger");
    const loggingUtil = this.diContainer.resolve<LoggingUtil>("loggingUtil");
    const correlationKey = this.diContainer.resolve<string>("correlationKey");
    const connectorId = this.diContainer.resolve<string>("hullAppId");

    try {
      const appSettings = this.diContainer.resolve<PrivateSettings>(
        "hullAppSettings",
      );

      if (
        !isNil(appSettings.zoho_modules) &&
        !appSettings.zoho_modules.includes("Leads") &&
        !appSettings.zoho_modules.includes("Contacts")
      ) {
        return;
      }

      const filterUtil = this.diContainer.resolve<FilterUtil>("filterUtil");
      const mappingUtil = this.diContainer.resolve<MappingUtil>("mappingUtil");

      const filteredEnvelopes = filterUtil.filterUserMessagesInitial(
        messages,
        isBatch,
      );

      const cachingUtil = this.diContainer.resolve<CachingUtil>("cachingUtil");
      const serviceClient = this.diContainer.resolve<ServiceClient>(
        "serviceClient",
      );
      const metaResponseLeads = await cachingUtil.getCachedApiResponse(
        `${connectorId}_fields_leads`,
        () => serviceClient.getFields({ module: "Leads" }),
        5 * 60,
      );

      if (metaResponseLeads.success === false) {
        throw metaResponseLeads.errorDetails!;
      }

      const metaResponseContacts = await cachingUtil.getCachedApiResponse(
        `${connectorId}_fields_contacts`,
        () => serviceClient.getFields({ module: "Contacts" }),
        5 * 60,
      );

      if (metaResponseContacts.success === false) {
        throw metaResponseContacts.errorDetails!;
      }

      if (filteredEnvelopes.upserts.length === 0) {
        // TODO: Log no-op
        return;
      }

      let leadEnvelopes = filteredEnvelopes.upserts.filter(
        (e) => e.serviceObject!.module === "Leads",
      );
      let contactEnvelopes = filteredEnvelopes.upserts.filter(
        (e) => e.serviceObject!.module === "Contacts",
      );

      const hullClient = this.diContainer.resolve<IHullClient>("hullClient");

      leadEnvelopes = leadEnvelopes
        .map((e) => {
          const mappedLead = mappingUtil.mapHullObjectToZohoRecord(
            e.message.user,
            e.serviceObject!.module,
            metaResponseLeads.data!.fields,
            correlationKey,
          );
          if (mappedLead.errors.length === 0) {
            return {
              message: e.message,
              objectType: e.objectType,
              operation: e.operation,
              notes: e.notes,
              serviceObject: {
                module: e.serviceObject!.module,
                data: mappedLead.record,
              },
            };
          } else {
            hullClient
              .asUser(e.message.user)
              .logger.error("outgoing.user.error", {
                message: "Invalid data.",
                errorDetails: mappedLead.errors,
              });
            // TODO: Add logging
            return undefined;
          }
        })
        .filter((e) => !isNil(e)) as any;

      contactEnvelopes = contactEnvelopes
        .map((e) => {
          const mappedContact = mappingUtil.mapHullObjectToZohoRecord(
            e.message.user,
            e.serviceObject!.module,
            metaResponseContacts.data!.fields,
            correlationKey,
          );
          if (mappedContact.errors.length === 0) {
            return {
              message: e.message,
              objectType: e.objectType,
              operation: e.operation,
              notes: e.notes,
              serviceObject: {
                module: e.serviceObject!.module,
                data: mappedContact.record,
              },
            };
          } else {
            hullClient
              .asUser(e.message.user)
              .logger.error("outgoing.user.error", {
                message: "Invalid data.",
                errorDetails: mappedContact.errors,
              });
            // TODO: Add logging
            return undefined;
          }
        })
        .filter((e) => !isNil(e)) as any;

      if (leadEnvelopes.length > 0) {
        const responseLeads = await serviceClient.upsertRecords({
          data: leadEnvelopes.map((e) => e.serviceObject!.data),
          module: "Leads",
        });

        if (responseLeads.success) {
          let i = 0;
          await asyncForEach(
            responseLeads.data!.data,
            async (d: Schema$ZohoRecord) => {
              if (d.status === "success") {
                const userIdent = leadEnvelopes[i].message.user;
                const attribs = mappingUtil.mapZohoRecordToHullAttributes(
                  "Leads",
                  d.details,
                  metaResponseLeads.data!.fields,
                  correlationKey,
                );
                await hullClient.asUser(userIdent).traits(attribs as any);
              } else {
                hullClient
                  .asUser(leadEnvelopes[i].message.user)
                  .logger.error("outgoing.user.error", {
                    message: "API call rejected",
                    errorDetails: d,
                  });
                // TODO: Log failure
              }
              i += 1;
            },
          );
        } else {
          // TODO: Mark all as errors
          throw responseLeads.errorDetails!;
        }
      }

      if (contactEnvelopes.length > 0) {
        const responseContacts = await serviceClient.upsertRecords({
          data: contactEnvelopes.map((e) => e.serviceObject!.data),
          module: "Contacts",
        });

        if (responseContacts.success) {
          let i = 0;
          await asyncForEach(
            responseContacts.data!.data,
            async (d: Schema$ZohoRecord) => {
              if (d.status === "success") {
                const userIdent = contactEnvelopes[i].message.user;
                const attribs = mappingUtil.mapZohoRecordToHullAttributes(
                  "Contacts",
                  d.details,
                  metaResponseContacts.data!.fields,
                  correlationKey,
                );
                await hullClient.asUser(userIdent).traits(attribs as any);
              } else {
                hullClient
                  .asUser(contactEnvelopes[i].message.user)
                  .logger.error("outgoing.user.error", {
                    message: "API call rejected",
                    errorDetails: d,
                  });
                // TODO: Log failure
              }
              i += 1;
            },
          );
        } else {
          // TODO: Mark all as errors
          throw responseContacts.errorDetails!;
        }
      }
    } catch (error) {
      logger.error(
        loggingUtil.composeErrorMessage(
          "OPERATION_SENDUSERMESSAGES_UNHANDLED",
          error,
          correlationKey,
        ),
      );
    }
  }

  /**
   * Processes outgoing notifications for account:update lane.
   *
   * @param {IHullAccountUpdateMessage[]} messages The notification messages.
   * @param {boolean} [isBatch=false] `True` if it is a batch; otherwise `false`.
   * @returns {Promise<void>} An awaitable Promise.
   * @memberof SyncAgent
   */
  public async sendAccountMessages(
    messages: IHullAccountUpdateMessage[],
    isBatch = false,
  ): Promise<void> {
    const logger = this.diContainer.resolve<Logger>("logger");
    const loggingUtil = this.diContainer.resolve<LoggingUtil>("loggingUtil");
    const correlationKey = this.diContainer.resolve<string>("correlationKey");
    const connectorId = this.diContainer.resolve<string>("hullAppId");

    try {
      const appSettings = this.diContainer.resolve<PrivateSettings>(
        "hullAppSettings",
      );

      if (
        !isNil(appSettings.zoho_modules) &&
        !appSettings.zoho_modules.includes("Accounts")
      ) {
        logger.debug(
          loggingUtil.composeOperationalMessage(
            "OPERATION_SENDACCOUNTMESSAGES_MODULENOTSUPPORTED",
            correlationKey,
          ),
        );
        return;
      }

      const filterUtil = this.diContainer.resolve<FilterUtil>("filterUtil");
      const mappingUtil = this.diContainer.resolve<MappingUtil>("mappingUtil");

      const filteredEnvelopes = filterUtil.filterAccountMessagesInitial(
        messages,
        isBatch,
      );

      const cachingUtil = this.diContainer.resolve<CachingUtil>("cachingUtil");
      const serviceClient = this.diContainer.resolve<ServiceClient>(
        "serviceClient",
      );
      const metaResponseAccounts = await cachingUtil.getCachedApiResponse(
        `${connectorId}_fields_accounts`,
        () => serviceClient.getFields({ module: "Accounts" }),
        5 * 60,
      );

      if (metaResponseAccounts.success === false) {
        throw metaResponseAccounts.errorDetails!;
      }

      if (filteredEnvelopes.upserts.length === 0) {
        logger.debug(
          loggingUtil.composeOperationalMessage(
            "OPERATION_SENDACCOUNTMESSAGES_NOOP",
            correlationKey,
          ),
        );
        return;
      }

      let accountEnvelopes = filteredEnvelopes.upserts.filter(
        (e) => e.serviceObject!.module === "Accounts",
      );

      const hullClient = this.diContainer.resolve<IHullClient>("hullClient");

      accountEnvelopes = accountEnvelopes
        .map((e) => {
          const mappedAccount = mappingUtil.mapHullObjectToZohoRecord(
            e.message.account,
            e.serviceObject!.module,
            metaResponseAccounts.data!.fields,
            correlationKey,
          );
          if (mappedAccount.errors.length === 0) {
            return {
              message: e.message,
              objectType: e.objectType,
              operation: e.operation,
              notes: e.notes,
              serviceObject: {
                module: e.serviceObject!.module,
                data: mappedAccount.record,
              },
            };
          } else {
            hullClient
              .asAccount(e.message.account)
              .logger.error("outgoing.account.error", {
                message: "Invalid data.",
                errorDetails: mappedAccount.errors,
              });
            // TODO: Add logging
            return undefined;
          }
        })
        .filter((e) => !isNil(e)) as any;

      if (accountEnvelopes.length > 0) {
        const responseAccounts = await serviceClient.upsertRecords({
          data: accountEnvelopes.map((e) => e.serviceObject!.data),
          module: "Accounts",
        });

        if (responseAccounts.success) {
          let i = 0;
          await asyncForEach(
            responseAccounts.data!.data,
            async (d: Schema$ZohoRecord) => {
              if (d.status === "success") {
                const acctIdent = accountEnvelopes[i].message.account;
                const attribs = mappingUtil.mapZohoRecordToHullAttributes(
                  "Accounts",
                  d.details,
                  metaResponseAccounts.data!.fields,
                  correlationKey,
                );
                await hullClient.asAccount(acctIdent).traits(attribs as any);
              } else {
                hullClient
                  .asAccount(accountEnvelopes[i].message.account)
                  .logger.error("outgoing.account.error", {
                    message: "API call rejected",
                    errorDetails: d,
                  });
                // TODO: Log failure
              }
              i += 1;
            },
          );
        } else {
          // TODO: Mark all as errors
          throw responseAccounts.errorDetails!;
        }
      }
    } catch (error) {
      logger.error(
        loggingUtil.composeErrorMessage(
          "OPERATION_SENDACCOUNTMESSAGES_UNHANDLED",
          error,
          correlationKey,
        ),
      );
    }
  }

  /**
   * Performs a fetch operation of Zoho records for the specified module.
   * @param {string} module The Zoho module. Allowed values are `leads`, `contacts` and `accounts`.
   * @param {string} fetchType The type of the fetch. Allowed values are `full` or `partial`.
   */
  public async fetchRecords(module: string, fetchType: string): Promise<void> {
    const allowedModules = ["leads", "contacts", "accounts"];

    if (allowedModules.includes(module) === false) {
      throw new Error(
        `Requested module '${module}' is not supported. Currently supported are the following entries: ${allowedModules.join(
          ", ",
        )}`,
      );
    }

    const logger = this.diContainer.resolve<Logger>("logger");
    const loggingUtil = this.diContainer.resolve<LoggingUtil>("loggingUtil");
    const correlationKey = this.diContainer.resolve<string>("correlationKey");
    const connectorId = this.diContainer.resolve<string>("hullAppId");
    const redisClient = this.diContainer.resolve<ConnectorRedisClient>(
      "redisClient",
    );
    const fetchLockKey = `${connectorId}_fetchlock_${module.toLowerCase()}`;

    try {
      const cachingUtil = this.diContainer.resolve<CachingUtil>("cachingUtil");
      const serviceClient = this.diContainer.resolve<ServiceClient>(
        "serviceClient",
      );
      const metaResponse = await cachingUtil.getCachedApiResponse(
        `${connectorId}_fields_${module}`,
        () => serviceClient.getFields({ module }),
        5 * 60,
      );

      if (metaResponse.success === false) {
        throw metaResponse.errorDetails!;
      }

      const fetchLock = await redisClient.get(fetchLockKey);

      if (!isNil(fetchLock)) {
        // TODO: Add logging that we skipped the fetch due to a lock
        return;
      }

      redisClient.set(
        fetchLockKey,
        { timestamp: DateTime.utc().toISO() },
        60 * 60 * 2, // Automatic expiration after two hours
      );

      const mappingUtil = this.diContainer.resolve<MappingUtil>("mappingUtil");
      const hullClient = this.diContainer.resolve<IHullClient>("hullClient");
      const maxAgoTimestamp = DateTime.utc().minus({ minutes: 90 });

      const hasModifiedTimestamp =
        isNil(
          metaResponse.data!.fields.find((f) => f.api_name === "Modified_Time"),
        ) === false;
      // We now have the metadata, so we can start looping over the records in Zoho
      let hasMore: boolean = true;
      let page: number = 1;
      const perPage = 200;
      while (hasMore === true) {
        const responseList = await serviceClient.listRecords({
          module,
          page,
          per_page: perPage,
          sort_by: hasModifiedTimestamp ? "Modified_Time" : undefined,
          sort_order: hasModifiedTimestamp ? "desc" : undefined,
        });

        if (responseList.success === false) {
          throw responseList.errorDetails!;
        }

        hasMore = responseList.data!.info.more_records;
        await asyncForEach(
          responseList.data!.data,
          async (record: Schema$ZohoRecord) => {
            if (
              hasModifiedTimestamp &&
              fetchType === "partail" &&
              DateTime.fromISO(get(record, "Modified_Time")) < maxAgoTimestamp
            ) {
              // No more importing, since we passed the partial threshold
              hasMore = false;
            } else {
              const hullIdent = mappingUtil.mapZohoRecordToHullIdent(
                module,
                record,
                metaResponse.data!.fields,
                correlationKey,
              );

              if (isNil(hullIdent)) {
                // Log a skip, since we know undefined here means a required identifier is missing.
                const hullObjectType =
                  module === "accounts" ? "account" : "user";
                hullClient.logger.info(`incoming.${hullObjectType}.skip`, {
                  reason: `One of the required identity fields is not present on the Zoho record with id '${record.id}'.`,
                });
              } else {
                const hullAttribs = mappingUtil.mapZohoRecordToHullAttributes(
                  module,
                  record,
                  metaResponse.data!.fields,
                  correlationKey,
                );
                if (isNil(hullAttribs)) {
                  // TODO: Log an error
                  if (module === "accounts") {
                    hullClient
                      .asAccount(hullIdent as any)
                      .logger.error("incoming.account.error", {
                        message:
                          "Failed to map Zoho record fields to Hull Account attributes. Please make sure you mapping is correct.",
                      });
                  } else {
                    hullClient
                      .asUser(hullIdent)
                      .logger.error("incoming.user.error", {
                        message:
                          "Failed to map Zoho record fields to Hull User attributes. Please make sure you mapping is correct.",
                      });
                  }
                } else {
                  if (module === "accounts") {
                    await hullClient
                      .asAccount(hullIdent as any)
                      .traits(hullAttribs);
                  } else {
                    await hullClient.asUser(hullIdent).traits(hullAttribs);
                  }
                }
              }
            }
          },
        );
      }
    } catch (error) {
      const logPayload = loggingUtil.composeErrorMessage(
        "OPERATION_FETCHRECORDS_UNHANDLED",
        cloneDeep(error),
        correlationKey,
      );
      logger.error(logPayload);
    } finally {
      await redisClient.delete(fetchLockKey);
    }
  }

  /**
   * Returns the fields schema for attribute mapping purposes.
   * @param objectType The Zoho module. Allowed values are `leads`, `contacts` and `accounts`.
   * @param direction The direction. Allowed values are `incoming` or `outgoing`.
   * @returns {Promise<FieldsSchema>} The fields schema.
   * @memberof SyncAgent
   */
  public async listMetadata(
    objectType: string,
    direction: string,
  ): Promise<FieldsSchema> {
    const fieldSchema: FieldsSchema = {
      error: null,
      ok: true,
      options: [],
    };

    const connectorId = this.diContainer.resolve<string>("hullAppId");
    const cachingUtil = this.diContainer.resolve<CachingUtil>("cachingUtil");
    const serviceClient = this.diContainer.resolve<ServiceClient>(
      "serviceClient",
    );
    const metaResponse = await cachingUtil.getCachedApiResponse(
      `${connectorId}_fields_${objectType}`,
      () => serviceClient.getFields({ module: objectType }),
      5 * 60,
    );

    if (metaResponse.success === false) {
      fieldSchema.error = metaResponse.errorDetails
        ? metaResponse.errorDetails.message
        : "Unknown error";
      fieldSchema.ok = false;
      return fieldSchema;
    }

    if (direction === "outgoing") {
      // Filter out readonly fields
      fieldSchema.options = metaResponse
        .data!.fields.filter(
          (f) => f.read_only === false && f.data_type !== "subform",
        )
        .map((f) => {
          return {
            value: f.api_name,
            label: f.display_label,
          };
        });
    } else {
      fieldSchema.options = metaResponse
        .data!.fields.filter((f) => f.data_type !== "subform")
        .map((f) => {
          return {
            value: f.api_name,
            label: f.display_label,
          };
        });
    }

    return fieldSchema;
  }
  /**
   * Returns the fields schema for identity resolution purposes.
   * @param objectType The Zoho module. Allowed values are `leads`, `contacts` and `accounts`.
   * @param direction The direction. Allowed values are `incoming` or `outgoing`.
   * @returns {Promise<FieldsSchema>} The fields schema.
   * @memberof SyncAgent
   */
  public async listMetadataIdentity(
    objectType: string,
    direction: string,
  ): Promise<FieldsSchema> {
    const fieldSchema: FieldsSchema = {
      error: null,
      ok: true,
      options: [],
    };

    const connectorId = this.diContainer.resolve<string>("hullAppId");
    const cachingUtil = this.diContainer.resolve<CachingUtil>("cachingUtil");
    const serviceClient = this.diContainer.resolve<ServiceClient>(
      "serviceClient",
    );
    const metaResponse = await cachingUtil.getCachedApiResponse(
      `${connectorId}_fields_${objectType}`,
      () => serviceClient.getFields({ module: objectType }),
      5 * 60,
    );

    if (metaResponse.success === false) {
      fieldSchema.error = metaResponse.errorDetails
        ? metaResponse.errorDetails.message
        : "Unknown error";
      fieldSchema.ok = false;
      return fieldSchema;
    }

    if (direction === "outgoing") {
      // Filter out readonly fields
      fieldSchema.options = metaResponse
        .data!.fields.filter(
          (f) => f.read_only === false && f.unique.casesensitive !== undefined,
        )
        .map((f) => {
          return {
            value: f.api_name,
            label: f.display_label,
          };
        });
    } else {
      fieldSchema.options = metaResponse
        .data!.fields.filter((f) => f.unique.casesensitive !== undefined)
        .map((f) => {
          return {
            value: f.api_name,
            label: f.display_label,
          };
        });
    }

    // Add the default upsert fields from Zoho, but mind the direction.
    // See: https://www.zoho.com/crm/developer/docs/api/upsert-records.html#dup_chk_flds
    switch (objectType) {
      case "leads":
      case "contacts":
        const emailField = metaResponse.data!.fields.find(
          (f) => f.api_name === "Email",
        );
        if (!isNil(emailField)) {
          fieldSchema.options.push({
            value: emailField.api_name,
            label: emailField.display_label,
          });
        }
        break;
      case "accounts":
        if (direction === "outgoing") {
          const nameField = metaResponse.data!.fields.find(
            (f) => f.api_name === "Account_Name",
          );
          if (!isNil(nameField)) {
            fieldSchema.options.push({
              value: nameField.api_name,
              label: nameField.display_label,
            });
          }
        } else {
          // On incoming add Website
          const websiteField = metaResponse.data!.fields.find(
            (f) => f.api_name === "Website",
          );
          if (!isNil(websiteField)) {
            fieldSchema.options.push({
              value: websiteField.api_name,
              label: websiteField.display_label,
            });
          }
        }
        break;
      default:
        // TODO: Log that no default fields have been added
        break;
    }

    return fieldSchema;
  }

  public async handleWebhook(
    data: Schema$ZohoNotificationRequest,
  ): Promise<void> {
    const correlationKey = this.diContainer.resolve<string>("correlationKey");
    const connectorId = this.diContainer.resolve<string>("hullAppId");
    const cachingUtil = this.diContainer.resolve<CachingUtil>("cachingUtil");
    const serviceClient = this.diContainer.resolve<ServiceClient>(
      "serviceClient",
    );
    const metaResponse = await cachingUtil.getCachedApiResponse(
      `${connectorId}_fields_${data.module.toLowerCase()}`,
      () => serviceClient.getFields({ module: data.module.toLowerCase() }),
      5 * 60,
    );
    if (metaResponse.success === false) {
      throw metaResponse.errorDetails!;
    }

    const mappingUtil = this.diContainer.resolve<MappingUtil>("mappingUtil");
    const hullClient = this.diContainer.resolve<IHullClient>("hullClient");

    await asyncForEach(data.ids, async (id: string) => {
      const responseObject = await serviceClient.getSpecificRecord({
        module: data.module,
        id,
      });

      if (responseObject.success && responseObject.data?.data.length === 1) {
        const hullIdent = mappingUtil.mapZohoRecordToHullIdent(
          data.module.toLowerCase(),
          responseObject.data!.data[0],
          metaResponse.data!.fields,
          correlationKey,
        );
        const hullAttribs = mappingUtil.mapZohoRecordToHullAttributes(
          data.module.toLowerCase(),
          responseObject.data!.data[0],
          metaResponse.data!.fields,
          correlationKey,
        );
        if (isNil(hullIdent)) {
          if (data.module.toLowerCase() === "accounts") {
            hullClient
              .asAccount(hullIdent as any)
              .logger.error("incoming.account.error", {
                message: "Failed to resolve identity.",
              });
          } else {
            hullClient
              .asUser(hullIdent as any)
              .logger.error("incoming.user.error", {
                message: "Failed to resolve identity.",
              });
          }
        } else {
          if (data.module.toLowerCase() === "accounts") {
            await hullClient
              .asAccount(hullIdent as any)
              .traits(hullAttribs as any);
          } else {
            await hullClient.asUser(hullIdent).traits(hullAttribs as any);
          }
        }
      } else {
        // TODO: Log error
        hullClient.logger.error("incoming.webhook.error", {
          message: responseObject.error,
          errorDetails: responseObject.errorDetails,
        });
      }
    });
  }

  /**
   * Determines the overall status of the connector.
   *
   * @returns {Promise<ConnectorStatusResponse>} The status response.
   * @memberof SyncAgent
   */
  public async determineConnectorStatus(): Promise<ConnectorStatusResponse> {
    const logger = this.diContainer.resolve<Logger>("logger");
    const loggingUtil = this.diContainer.resolve<LoggingUtil>("loggingUtil");
    const correlationKey = this.diContainer.resolve<string>("correlationKey");

    const statusResult: ConnectorStatusResponse = {
      status: "ok",
      messages: [],
    };

    try {
      logger.debug(
        loggingUtil.composeOperationalMessage(
          "OPERATION_CONNECTORSTATUS_START",
          correlationKey,
        ),
      );

      const hullAppSettings = this.diContainer.resolve<PrivateSettings>(
        "hullAppSettings",
      );
      const hullClient = this.diContainer.resolve<IHullClient>("hullClient");
      const connectorId = this.diContainer.resolve<string>("hullAppId");

      const { refresh_token, zoho_accounts_server } = hullAppSettings;

      // Perfom checks to verify setup is complete
      if (isNil(refresh_token)) {
        statusResult.status = "setupRequired";
        statusResult.messages.push(STATUS_SETUPREQUIRED_NOAPIKEY);
      }

      if (!isNil(refresh_token) && !isNil(zoho_accounts_server)) {
        const serviceClient = this.diContainer.resolve<ServiceClient>(
          "serviceClient",
        );
        const responseTokens = await serviceClient.refreshToken(
          zoho_accounts_server,
          refresh_token,
        );

        const responseModules = await serviceClient.listModules();

        await (hullClient as any).utils.settings.update({
          access_token: responseTokens.data!.access_token,
          api_domain: responseTokens.data!.api_domain,
          token_type: responseTokens.data!.token_type,
          expires_in: responseTokens.data!.expires_in,
          expires_at: DateTime.utc()
            .plus({ seconds: responseTokens.data!.expires_in })
            .toISO(),
          zoho_modules: responseModules.data
            ? responseModules.data.modules.map((m) => m.api_name)
            : null,
        });

        await this.ensureNotifications(responseModules.data?.modules);
      }

      const appSecret = this.diContainer.resolve<string>("hullAppSecret");
      const appOrg = this.diContainer.resolve<string>("hullAppOrganization");
      const redisClient = this.diContainer.resolve<ConnectorRedisClient>(
        "redisClient",
      );
      const connectorAuth = {
        id: connectorId,
        secret: appSecret,
        organization: appOrg,
      };
      await redisClient.set(connectorId, connectorAuth, 60 * 60 * 12);

      logger.debug(
        loggingUtil.composeOperationalMessage(
          "OPERATION_CONNECTORSTATUS_STARTHULLAPI",
          correlationKey,
        ),
      );

      await hullClient.put(`${connectorId}/status`, statusResult);

      logger.debug(
        loggingUtil.composeOperationalMessage(
          "OPERATION_CONNECTORSTATUS_SUCCESS",
          correlationKey,
        ),
      );
    } catch (error) {
      const logPayload = loggingUtil.composeErrorMessage(
        "OPERATION_CONNECTORSTATUS_UNHANDLED",
        cloneDeep(error),
        correlationKey,
      );
      logger.error(logPayload);
      statusResult.status = "error";
      if (logPayload && logPayload.message) {
        statusResult.messages.push(logPayload.message);
      } else {
        statusResult.messages.push(ERROR_UNHANDLED_GENERIC);
      }
    }

    return statusResult;
  }

  /**
   * Returns the uri to initiate the OAuth 2.0 flow.
   * @param token The Hull Client token passed along as state.
   * @param clientId The Client ID registered with Zoho. Optional. Defaults to `process.env.ZOHO_CLIENT_ID`.
   * @param requestedScopes The list of requested scopes. Optional. Defaults to `process.env.ZOHO_SCOPES`.
   * @param redirectUri The registered callback url for the client with Zoho. Optional. Defaults to `process.env.ZOHO_CALLBACK_URL`.
   * @returns {string} The full uri to initiate the OAuth 2.0 flow in the browser.
   * @memberof SyncAgent
   */
  public getOAuthUri(
    token: string,
    clientId?: string,
    requestedScopes?: string[],
    redirectUri?: string,
  ): string {
    const client_id = !isNil(clientId) ? clientId : process.env.ZOHO_CLIENT_ID;
    const scope =
      !isNil(requestedScopes) && requestedScopes.length > 0
        ? requestedScopes.join(",")
        : process.env.ZOHO_SCOPES;

    const redirect_uri = !isNil(redirectUri)
      ? redirectUri
      : process.env.ZOHO_CALLBACK_URL;
    const qsParams = {
      scope,
      client_id,
      response_type: "code",
      access_type: "offline",
      redirect_uri,
      state: token,
    };

    return `https://accounts.zoho.com/oauth/v2/auth?${qs.stringify(qsParams)}`;
  }

  /**
   * Handles the OAuth 2.0 response from the initial code grant.
   * @param data The OAuth 2.0 response from Zoho's accounts server.
   * @memberof SyncAgent
   */
  public async handleOAuthResponse(data: ZohoOAuthResponse): Promise<void> {
    const logger = this.diContainer.resolve<Logger>("logger");
    const loggingUtil = this.diContainer.resolve<LoggingUtil>("loggingUtil");
    const correlationKey = this.diContainer.resolve<string>("correlationKey");

    try {
      logger.debug(
        loggingUtil.composeOperationalMessage(
          "OPERATION_AUTHTOKENFROMCODE_START",
          correlationKey,
        ),
      );

      const serviceClient = this.diContainer.resolve<ServiceClient>(
        "serviceClient",
      );
      const hullClient = this.diContainer.resolve<IHullClient>("hullClient");
      const responseTokens = await serviceClient.generateTokens(
        data["accounts-server"],
        data.code,
      );

      await (hullClient as any).utils.settings.update({
        zoho_location: data.location,
        zoho_accounts_server: data["accounts-server"],
        refresh_token: responseTokens.data!.refresh_token,
        access_token: responseTokens.data!.access_token,
        api_domain: responseTokens.data!.api_domain,
        token_type: responseTokens.data!.token_type,
        expires_in: responseTokens.data!.expires_in,
        expires_at: DateTime.utc()
          .plus({ seconds: responseTokens.data!.expires_in })
          .toISO(),
      });

      logger.debug(
        loggingUtil.composeOperationalMessage(
          "OPERATION_AUTHTOKENFROMCODE_SUCCESS",
          correlationKey,
        ),
      );
    } catch (error) {
      const logPayload = loggingUtil.composeErrorMessage(
        "OPERATION_AUTHTOKENFROMCODE_UNHANDLED",
        cloneDeep(error),
        correlationKey,
      );
      logger.error(logPayload);
      // Re-throw error to make sure we do not redirect the user
      throw error;
    }
  }

  /**
   * Determines the authentication status of the connector.
   *
   * @returns {Promise<AuthStatus>} The authentication status.
   * @memberof SyncAgent
   */
  public async determineAuthStatus(): Promise<AuthStatus> {
    const logger = this.diContainer.resolve<Logger>("logger");
    const loggingUtil = this.diContainer.resolve<LoggingUtil>("loggingUtil");
    const correlationKey = this.diContainer.resolve<string>("correlationKey");
    const hullAppSettings = this.diContainer.resolve<PrivateSettings>(
      "hullAppSettings",
    );

    const result: AuthStatus = {
      statusCode: 200,
      message: "Connected",
    };

    try {
      logger.debug(
        loggingUtil.composeOperationalMessage(
          "OPERATION_AUTHSTATUS_START",
          correlationKey,
        ),
      );

      const {
        access_token,
        zoho_location,
        zoho_accounts_server,
        api_domain,
      } = hullAppSettings;
      if (
        access_token === undefined ||
        zoho_location === undefined ||
        zoho_accounts_server === undefined ||
        api_domain === undefined
      ) {
        result.statusCode = 401;
        result.message = "Connector is not authorized.";
        logger.debug(
          loggingUtil.composeOperationalMessage(
            "OPERATION_AUTHSTATUS_UNAUTHORIZED",
            correlationKey,
          ),
        );
      } else {
        result.message = `Connected to Zoho API '${api_domain}' in location '${zoho_location}'.`;

        logger.debug(
          loggingUtil.composeOperationalMessage(
            "OPERATION_AUTHSTATUS_SUCCESS",
            correlationKey,
          ),
        );
      }
    } catch (error) {
      const logPayload = loggingUtil.composeErrorMessage(
        "OPERATION_AUTHSTATUS_UNHANDLED",
        cloneDeep(error),
        correlationKey,
      );
      logger.error(logPayload);
      result.statusCode = 500;
      if (logPayload && logPayload.message) {
        result.message = logPayload.message;
      } else {
        result.message = ERROR_UNHANDLED_GENERIC;
      }
    }

    return Promise.resolve(result);
  }

  private async ensureNotifications(
    modules?: Schema$ZohoModule[],
  ): Promise<void> {
    const logger = this.diContainer.resolve<Logger>("logger");
    const loggingUtil = this.diContainer.resolve<LoggingUtil>("loggingUtil");
    const correlationKey = this.diContainer.resolve<string>("correlationKey");
    const hullAppSettings = this.diContainer.resolve<PrivateSettings>(
      "hullAppSettings",
    );
    const hullClient = this.diContainer.resolve<IHullClient>("hullClient");
    const connectorId = this.diContainer.resolve<string>("hullAppId");
    const appToken = this.diContainer.resolve<string>("hullAppToken");
    const appSettings = this.diContainer.resolve<PrivateSettings>(
      "hullAppSettings",
    );
    const serviceClient = this.diContainer.resolve<ServiceClient>(
      "serviceClient",
    );

    const baseChannelId = isNil(appSettings.notifications_channelid_base)
      ? 1000000268000
      : appSettings.notifications_channelid_base;
    const moduleApiNames = modules ? modules.map((m) => m.api_name) : [];
    // Lead Notifications
    if (isNil(modules) || moduleApiNames.includes("Leads")) {
      if (isNil(appSettings.notifications_channelid_lead)) {
        // Enable Notifications for Leads
        const channelIdLead = baseChannelId + 1;
        const notificationLead: Schema$ZohoNotification = {
          channel_expiry: DateTime.local()
            .set({ millisecond: 0 })
            .plus({ hours: 2 })
            .toISO({ suppressMilliseconds: true }),
          channel_id: `${channelIdLead}`,
          events: ["Leads.all"],
          notify_url: `${process.env.ZOHO_NOTIFY_URL_BASE}/notifications?token=${appToken}`,
          token: connectorId,
        };
        const responseEnableLead = await serviceClient.enableNotifications({
          watch: [notificationLead],
        });
        if (responseEnableLead.success && responseEnableLead.data) {
          if (responseEnableLead.data.watch[0].status === "success") {
            await (hullClient as any).utils.settings.update({
              notifications_channelid_lead: `${channelIdLead}`,
            });
          } else {
            logger.error(
              loggingUtil.composeErrorMessage(
                "OPERATION_ENABLENOTIFICATIONS_LEADS_FAILED",
                responseEnableLead.data,
                correlationKey,
              ),
            );
          }
        } else {
          logger.error(
            loggingUtil.composeErrorMessage(
              "OPERATION_ENABLENOTIFICATIONS_LEADS_FAILED",
              responseEnableLead.errorDetails,
              correlationKey,
            ),
          );
        }
      } else {
        // Update Notifications for Leads
        const notificationLead: Schema$ZohoNotification = {
          channel_expiry: DateTime.local()
            .set({ millisecond: 0 })
            .plus({ hours: 2 })
            .toISO({ suppressMilliseconds: true }),
          channel_id: appSettings.notifications_channelid_lead,
          events: ["Leads.all"],
          notify_url: `${process.env.ZOHO_NOTIFY_URL_BASE}/notifications?token=${appToken}`,
          token: connectorId,
        };
        const responseUpdateLead = await serviceClient.updateNotificationDetails(
          {
            watch: [notificationLead],
          },
        );
        if (
          responseUpdateLead.success === false ||
          (responseUpdateLead.data &&
            responseUpdateLead.data.watch[0].status !== "success")
        ) {
          await (hullClient as any).utils.settings.update({
            notifications_channelid_lead: null,
          });
        }
      }
    }

    // Contact Notifications
    if (isNil(modules) || moduleApiNames.includes("Contacts")) {
      if (isNil(appSettings.notifications_channelid_contact)) {
        // Enable Notifications for Contacts
        const channelIdContact = baseChannelId + 2;
        const notificationContact: Schema$ZohoNotification = {
          channel_expiry: DateTime.local()
            .set({ millisecond: 0 })
            .plus({ hours: 2 })
            .toISO({ suppressMilliseconds: true }),
          channel_id: `${channelIdContact}`,
          events: ["Contacts.all"],
          notify_url: `${process.env.ZOHO_NOTIFY_URL_BASE}/notifications?token=${appToken}`,
          token: connectorId,
        };
        const responseEnableContact = await serviceClient.enableNotifications({
          watch: [notificationContact],
        });
        if (responseEnableContact.success && responseEnableContact.data) {
          if (responseEnableContact.data.watch[0].status === "success") {
            await (hullClient as any).utils.settings.update({
              notifications_channelid_contact: `${channelIdContact}`,
            });
          } else {
            logger.error(
              loggingUtil.composeErrorMessage(
                "OPERATION_ENABLENOTIFICATIONS_CONTACTS_FAILED",
                responseEnableContact.data,
                correlationKey,
              ),
            );
          }
        } else {
          logger.error(
            loggingUtil.composeErrorMessage(
              "OPERATION_ENABLENOTIFICATIONS_CONTACTS_FAILED",
              responseEnableContact.errorDetails,
              correlationKey,
            ),
          );
        }
      } else {
        // Update Notifications for Contacts
        const notificationContact: Schema$ZohoNotification = {
          channel_expiry: DateTime.local()
            .set({ millisecond: 0 })
            .plus({ hours: 2 })
            .toISO({ suppressMilliseconds: true }),
          channel_id: appSettings.notifications_channelid_contact,
          events: ["Contacts.all"],
          notify_url: `${process.env.ZOHO_NOTIFY_URL_BASE}/notifications?token=${appToken}`,
          token: connectorId,
        };
        const responseUpdateContact = await serviceClient.updateNotificationDetails(
          {
            watch: [notificationContact],
          },
        );
        if (
          responseUpdateContact.success === false ||
          (responseUpdateContact.data &&
            responseUpdateContact.data.watch[0].status !== "success")
        ) {
          await (hullClient as any).utils.settings.update({
            notifications_channelid_contact: null,
          });
        }
      }
    }

    // Account Notifications
    if (isNil(modules) || moduleApiNames.includes("Accounts")) {
      if (isNil(appSettings.notifications_channelid_account)) {
        // Enable Notifications for Accounts
        const channelIdAccount = baseChannelId + 3;
        const notificationAccount: Schema$ZohoNotification = {
          channel_expiry: DateTime.local()
            .set({ millisecond: 0 })
            .plus({ hours: 2 })
            .toISO({ suppressMilliseconds: true }),
          channel_id: `${channelIdAccount}`,
          events: ["Accounts.all"],
          notify_url: `${process.env.ZOHO_NOTIFY_URL_BASE}/notifications?token=${appToken}`,
          token: connectorId,
        };
        const responseEnableAccount = await serviceClient.enableNotifications({
          watch: [notificationAccount],
        });
        if (responseEnableAccount.success && responseEnableAccount.data) {
          if (responseEnableAccount.data.watch[0].status === "success") {
            await (hullClient as any).utils.settings.update({
              notifications_channelid_account: `${channelIdAccount}`,
            });
          } else {
            logger.error(
              loggingUtil.composeErrorMessage(
                "OPERATION_ENABLENOTIFICATIONS_ACCOUNTS_FAILED",
                responseEnableAccount.data,
                correlationKey,
              ),
            );
          }
        } else {
          logger.error(
            loggingUtil.composeErrorMessage(
              "OPERATION_ENABLENOTIFICATIONS_ACCOUNTS_FAILED",
              responseEnableAccount.errorDetails,
              correlationKey,
            ),
          );
        }
      } else {
        // Update Notifications for Accounts
        const notificationAccount: Schema$ZohoNotification = {
          channel_expiry: DateTime.local()
            .set({ millisecond: 0 })
            .plus({ hours: 2 })
            .toISO({ suppressMilliseconds: true }),
          channel_id: appSettings.notifications_channelid_account,
          events: ["Accounts.all"],
          notify_url: `${process.env.ZOHO_NOTIFY_URL_BASE}/notifications?token=${appToken}`,
          token: connectorId,
        };
        const responseUpdateAccount = await serviceClient.updateNotificationDetails(
          {
            watch: [notificationAccount],
          },
        );
        if (
          responseUpdateAccount.success === false ||
          (responseUpdateAccount.data &&
            responseUpdateAccount.data.watch[0].status !== "success")
        ) {
          await (hullClient as any).utils.settings.update({
            notifications_channelid_account: null,
          });
        }
      }
    }
  }
}
