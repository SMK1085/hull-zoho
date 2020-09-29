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
    return Promise.resolve();
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
    return Promise.resolve();
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
              // console.log(">>> Hull Ident", hullIdent);
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
                // console.log(">>> Hull Attributes", hullAttribs);
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

        await (hullClient as any).utils.settings.update({
          access_token: responseTokens.data!.access_token,
          api_domain: responseTokens.data!.api_domain,
          token_type: responseTokens.data!.token_type,
          expires_in: responseTokens.data!.expires_in,
          expires_at: DateTime.utc()
            .plus({ seconds: responseTokens.data!.expires_in })
            .toISO(),
        });

        await this.ensureNotifications();
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

  private async ensureNotifications(): Promise<void> {
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

    // Lead Notifications
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
          // TODO: Replace with logger implementation
          console.error(
            ">>> Failed to enable lead notifications",
            JSON.stringify(responseEnableLead),
          );
        }
      } else {
        // TODO: Replace with logger implementation
        console.error(
          ">>> Failed to enable lead notifications",
          responseEnableLead,
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
      const responseUpdateLead = await serviceClient.updateNotificationDetails({
        watch: [notificationLead],
      });
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

    // Contact Notifications
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
          // TODO: Replace with logger implementation
          console.error(
            ">>> Failed to enable contact notifications",
            JSON.stringify(responseEnableContact),
          );
        }
      } else {
        // TODO: Replace with logger implementation
        console.error(
          ">>> Failed to enable contact notifications",
          responseEnableContact,
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

    // Account Notifications
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
          // TODO: Replace with logger implementation
          console.error(
            ">>> Failed to enable account notifications",
            JSON.stringify(responseEnableAccount),
          );
        }
      } else {
        // TODO: Replace with logger implementation
        console.error(
          ">>> Failed to enable account notifications",
          responseEnableAccount,
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
