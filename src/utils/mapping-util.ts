import { isNil, get, set, forEach, forIn } from "lodash";
import { DateTime } from "luxon";
import { PrivateSettings } from "../core/connector";
import { IHullAccountAttributes, IHullAccountClaims } from "../types/account";
import { IHullUserClaims, IHullUserAttributes } from "../types/user";
import {
  HullConnectorAttributeMapping,
  HullConnectorIdentityMapping,
} from "../types/hull-connector";
import jsonata from "jsonata";
import { Schema$ZohoField, Schema$ZohoRecord } from "../core/service-objects";
import { Logger } from "winston";
import { LoggingUtil } from "./logging-util";

const ATTRIBUTE_GROUPS = {
  lead: "zoho_lead",
  contact: "zoho_contact",
  account: "zoho",
};

const ANONYMOUSID_PREFIXES = {
  lead: ATTRIBUTE_GROUPS.lead.replace("_", "-"),
  contact: ATTRIBUTE_GROUPS.contact.replace("_", "-"),
  account: ATTRIBUTE_GROUPS.account,
};

export class MappingUtil {
  public readonly appSettings: PrivateSettings;
  public readonly logger: Logger;
  public readonly loggingUtil: LoggingUtil;
  constructor(options: any) {
    this.appSettings = options.hullAppSettings;
    this.logger = options.logger;
    this.loggingUtil = options.loggingUtil;
  }

  public mapZohoRecordToHullIdent(
    module: string,
    data: Schema$ZohoRecord,
    fieldDefs: Schema$ZohoField[],
    correlationKey?: string,
  ): IHullUserClaims | IHullAccountClaims | undefined {
    let result: IHullUserClaims | IHullAccountClaims | undefined = undefined;
    switch (module) {
      case "leads":
      case "Leads":
        result = this.mapZohoLeadRecordToHullIdent(
          data,
          fieldDefs,
          correlationKey,
        );
        break;
      case "contacts":
      case "Contacts":
        result = this.mapZohoContactRecordToHullIdent(
          data,
          fieldDefs,
          correlationKey,
        );
        break;
      case "accounts":
      case "Accounts":
        result = this.mapZohoAccountRecordToHullIdent(
          data,
          fieldDefs,
          correlationKey,
        );
        break;
      default:
        this.logger.warn(
          this.loggingUtil.composeOperationalMessage(
            "OPERATION_MAPPING_MODULE_UNSUPPORTED",
            correlationKey,
            `Unsupported module type '${module}' for mapping Zoho Record to Hull Object Identity.`,
          ),
        );
        result = undefined;
        break;
    }

    return result;
  }

  public mapZohoRecordToHullAttributes(
    module: string,
    data: Schema$ZohoRecord,
    fieldDefs: Schema$ZohoField[],
    correlationKey?: string,
  ): IHullUserAttributes | IHullAccountAttributes | undefined {
    let result:
      | IHullUserAttributes
      | IHullAccountAttributes
      | undefined = undefined;
    switch (module) {
      case "leads":
      case "Leads":
        result = this.mapZohoLeadRecordToHullAttributes(
          data,
          fieldDefs,
          correlationKey,
        );
        break;
      case "contacts":
      case "Contacts":
        result = this.mapZohoContactRecordToHullAttributes(
          data,
          fieldDefs,
          correlationKey,
        );
        break;
      case "accounts":
      case "Accounts":
        result = this.mapZohoAccountRecordToHullAttributes(
          data,
          fieldDefs,
          correlationKey,
        );
        break;
      default:
        this.logger.warn(
          this.loggingUtil.composeOperationalMessage(
            "OPERATION_MAPPING_MODULE_UNSUPPORTED",
            correlationKey,
            `Unsupported module type '${module}' for mapping Zoho Record to Hull Attributes.`,
          ),
        );
        result = undefined;
        break;
    }

    return result;
  }

  private mapZohoLeadRecordToHullAttributes(
    data: Schema$ZohoRecord,
    fieldDefs: Schema$ZohoField[],
    correlationKey?: string,
  ): IHullUserAttributes {
    const result: IHullUserAttributes = {};
    forEach(
      this.appSettings.mapping_in_lead,
      (mapping: HullConnectorAttributeMapping) => {
        if (!isNil(mapping.hull) && !isNil(mapping.service)) {
          const fieldDef = fieldDefs.find((fd) => {
            return fd.api_name === mapping.service;
          });
          if (!isNil(fieldDef)) {
            const expression = jsonata(mapping.service!);
            if (
              fieldDef.data_type === "ownerlookup" ||
              fieldDef.data_type === "lookup"
            ) {
              const valueObj = this.mapZohoValueToHullValue(
                fieldDef,
                expression.evaluate(data),
              );
              forIn(valueObj, (v: any, k: string) => {
                set(result, `${mapping.hull!.replace("traits_", "")}_${k}`, {
                  value: v,
                  operation: mapping.overwrite === false ? "setIfNull" : "set",
                });
              });
            } else {
              set(result, mapping.hull!.replace("traits_", ""), {
                value: this.mapZohoValueToHullValue(
                  fieldDef,
                  expression.evaluate(data),
                ),
                operation: mapping.overwrite === false ? "setIfNull" : "set",
              });
            }
          }
        }
      },
    );

    // Always set the lead id
    set(result, `${ATTRIBUTE_GROUPS.lead}/id`, {
      value: data.id,
      operation: "setIfNull",
    });

    return result;
  }

  private mapZohoContactRecordToHullAttributes(
    data: Schema$ZohoRecord,
    fieldDefs: Schema$ZohoField[],
    correlationKey?: string,
  ): IHullUserAttributes {
    const result: IHullUserAttributes = {};
    forEach(
      this.appSettings.mapping_in_contact,
      (mapping: HullConnectorAttributeMapping) => {
        if (!isNil(mapping.hull) && !isNil(mapping.service)) {
          const fieldDef = fieldDefs.find((fd) => {
            return fd.api_name === mapping.service;
          });
          if (!isNil(fieldDef)) {
            const expression = jsonata(mapping.service!);
            if (
              fieldDef.data_type === "ownerlookup" ||
              fieldDef.data_type === "lookup"
            ) {
              const valueObj = this.mapZohoValueToHullValue(
                fieldDef,
                expression.evaluate(data),
              );
              forIn(valueObj, (v: any, k: string) => {
                set(result, `${mapping.hull!.replace("traits_", "")}_${k}`, {
                  value: v,
                  operation: mapping.overwrite === false ? "setIfNull" : "set",
                });
              });
            } else {
              set(result, mapping.hull!.replace("traits_", ""), {
                value: this.mapZohoValueToHullValue(
                  fieldDef,
                  expression.evaluate(data),
                ),
                operation: mapping.overwrite === false ? "setIfNull" : "set",
              });
            }
          }
        }
      },
    );

    // Always set the contact id
    set(result, `${ATTRIBUTE_GROUPS.contact}/id`, {
      value: data.id,
      operation: "setIfNull",
    });

    return result;
  }

  private mapZohoAccountRecordToHullAttributes(
    data: Schema$ZohoRecord,
    fieldDefs: Schema$ZohoField[],
    correlationKey?: string,
  ): IHullAccountAttributes {
    const result: IHullAccountAttributes = {};
    forEach(
      this.appSettings.mapping_in_account,
      (mapping: HullConnectorAttributeMapping) => {
        if (!isNil(mapping.hull) && !isNil(mapping.service)) {
          const fieldDef = fieldDefs.find((fd) => {
            return fd.api_name === mapping.service;
          });
          if (!isNil(fieldDef)) {
            const expression = jsonata(mapping.service!);
            if (
              fieldDef.data_type === "ownerlookup" ||
              fieldDef.data_type === "lookup"
            ) {
              const valueObj = this.mapZohoValueToHullValue(
                fieldDef,
                expression.evaluate(data),
              );
              forIn(valueObj, (v: any, k: string) => {
                set(result, `${mapping.hull!.replace("traits_", "")}_${k}`, {
                  value: v,
                  operation: mapping.overwrite === false ? "setIfNull" : "set",
                });
              });
            } else {
              set(result, mapping.hull!.replace("traits_", ""), {
                value: this.mapZohoValueToHullValue(
                  fieldDef,
                  expression.evaluate(data),
                ),
                operation: mapping.overwrite === false ? "setIfNull" : "set",
              });
            }
          }
        }
      },
    );

    // Always set the account id
    set(result, `${ATTRIBUTE_GROUPS.account}/id`, {
      value: data.id,
      operation: "setIfNull",
    });

    return result;
  }

  private mapZohoLeadRecordToHullIdent(
    data: Schema$ZohoRecord,
    fieldDefs: Schema$ZohoField[],
    correlationKey?: string,
  ): IHullUserClaims | undefined {
    const result: IHullUserClaims = {
      anonymous_id: `${ANONYMOUSID_PREFIXES.lead}:${data.id}`,
    };

    let hasAllRequiredMappings: boolean = true;

    forEach(
      this.appSettings.identity_in_lead,
      (im: HullConnectorIdentityMapping) => {
        // Process only valid mappings
        if (!isNil(im.hull) && !isNil(im.service)) {
          const fieldDef = fieldDefs.find((fd) => {
            return fd.api_name === im.service;
          });
          if (!isNil(fieldDef)) {
            const expression = jsonata(im.service!);
            const serviceVal = this.mapZohoValueToHullValue(
              fieldDef,
              expression.evaluate(data),
            );
            if (im.required === true && isNil(serviceVal)) {
              // TODO: Add logging here
              hasAllRequiredMappings = false;
              return false;
            } else if (!isNil(serviceVal)) {
              set(result, im.hull, serviceVal);
            }
          }
        }
      },
    );

    if ((hasAllRequiredMappings as boolean) === false) {
      return undefined;
    }

    return result;
  }

  private mapZohoContactRecordToHullIdent(
    data: Schema$ZohoRecord,
    fieldDefs: Schema$ZohoField[],
    correlationKey?: string,
  ): IHullUserClaims | undefined {
    const result: IHullUserClaims = {
      anonymous_id: `${ANONYMOUSID_PREFIXES.contact}:${data.id}`,
    };

    let hasAllRequiredMappings: boolean = true;

    forEach(
      this.appSettings.identity_in_contact,
      (im: HullConnectorIdentityMapping) => {
        // Process only valid mappings
        if (!isNil(im.hull) && !isNil(im.service)) {
          const fieldDef = fieldDefs.find((fd) => {
            return fd.api_name === im.service;
          });
          if (!isNil(fieldDef)) {
            const expression = jsonata(im.service!);
            const serviceVal = this.mapZohoValueToHullValue(
              fieldDef,
              expression.evaluate(data),
            );
            if (im.required === true && isNil(serviceVal)) {
              // TODO: Add logging here
              hasAllRequiredMappings = false;
              return false;
            } else if (!isNil(serviceVal)) {
              set(result, im.hull, serviceVal);
            }
          }
        }
      },
    );

    if ((hasAllRequiredMappings as boolean) === false) {
      return undefined;
    }

    return result;
  }

  private mapZohoAccountRecordToHullIdent(
    data: Schema$ZohoRecord,
    fieldDefs: Schema$ZohoField[],
    correlationKey?: string,
  ): IHullAccountClaims | undefined {
    const result: IHullAccountClaims = {
      anonymous_id: `${ANONYMOUSID_PREFIXES.account}:${data.id}`,
    };

    let hasAllRequiredMappings: boolean = true;

    forEach(
      this.appSettings.identity_in_account,
      (im: HullConnectorIdentityMapping) => {
        // Process only valid mappings
        if (!isNil(im.hull) && !isNil(im.service)) {
          const fieldDef = fieldDefs.find((fd) => {
            return fd.api_name === im.service;
          });
          if (!isNil(fieldDef)) {
            const expression = jsonata(im.service!);
            const serviceVal = this.mapZohoValueToHullValue(
              fieldDef,
              expression.evaluate(data),
            );
            if (im.required === true && isNil(serviceVal)) {
              // TODO: Add logging here
              hasAllRequiredMappings = false;
              return false;
            } else if (!isNil(serviceVal)) {
              set(result, im.hull, serviceVal);
            }
          }
        }
      },
    );

    if ((hasAllRequiredMappings as boolean) === false) {
      return undefined;
    }

    return result;
  }

  private mapZohoValueToHullValue(
    fieldDef: Schema$ZohoField,
    zohoVal: any,
  ): any {
    let result = zohoVal;
    switch (fieldDef.data_type) {
      // Handle all the strings
      case "autonumber":
      case "email":
      case "picklist":
      case "text":
      case "textarea":
      case "website":
        if (fieldDef.json_type === "jsonarray") {
          result = zohoVal; // It's already a text array in this case, no casting
        } else {
          result = isNil(zohoVal) ? null : `${zohoVal}`;
        }
        break;
      // Handle floating numbers
      case "currency":
      case "double":
        if (typeof zohoVal === "string") {
          result = parseFloat(zohoVal);
        }
        break;
      // Handle integer numbers
      case "integer":
      case "bigint":
        if (typeof zohoVal === "string") {
          result = parseInt(zohoVal, 10);
        }
        break;
      case "ownerlookup":
        const ownerObj = {
          id: null,
          email: null,
          name: null,
        };
        if (!isNil(get(zohoVal, "id", undefined))) {
          ownerObj.id = zohoVal.id;
        }
        if (!isNil(get(zohoVal, "email", undefined))) {
          ownerObj.email = zohoVal.email;
        }
        if (!isNil(get(zohoVal, "name", undefined))) {
          ownerObj.name = zohoVal.name;
        }

        result = ownerObj;
        break;
      // Handle date and datetime values
      case "datetime":
      case "date":
        if (typeof zohoVal === "string") {
          result = DateTime.fromISO(zohoVal).toISO();
        } else if (typeof zohoVal === "number") {
          result = DateTime.fromMillis(zohoVal).toISO();
        }
        break;
      case "lookup":
        const lookupObj = {
          id: null,
          name: null,
        };
        if (!isNil(get(zohoVal, "id", undefined))) {
          lookupObj.id = zohoVal.id;
        }
        if (!isNil(get(zohoVal, "name", undefined))) {
          lookupObj.name = zohoVal.name;
        }

        result = lookupObj;
        break;
      case "multiselectlookup":
        // This data won't be present, until we query the related lists api
        result = null;
        break;
      case "formula":
        if (
          fieldDef.formula.return_type === "decimal" ||
          fieldDef.formula.return_type === "currency"
        ) {
          if (typeof zohoVal === "string") {
            result = parseFloat(zohoVal);
          } else {
            result = zohoVal;
          }
        } else if (
          fieldDef.formula.return_type === "date" ||
          fieldDef.formula.return_type === "datetime"
        ) {
          if (typeof zohoVal === "string") {
            result = DateTime.fromISO(zohoVal).toISO();
          } else if (typeof zohoVal === "number") {
            result = DateTime.fromMillis(zohoVal).toISO();
          }
        } else if (fieldDef.formula.return_type === "string") {
          if (fieldDef.json_type === "jsonarray") {
            result = zohoVal;
          } else {
            result = isNil(zohoVal) ? null : `${zohoVal}`;
          }
        } else {
          result = zohoVal;
        }
        break;
      case "boolean":
        result = zohoVal;
        break;
      default:
        result = null;
        break;
    }

    return result;
  }
}
