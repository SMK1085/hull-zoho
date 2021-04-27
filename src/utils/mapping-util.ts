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
import {
  Schema$ZohoField,
  Schema$ZohoNoteCreate,
  Schema$ZohoRecord,
} from "../core/service-objects";
import { Logger } from "winston";
import { LoggingUtil } from "./logging-util";
import IHullUserEvent from "../types/user-event";

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

  public mapHullObjectToZohoRecord(
    hullProfileData: any,
    module: string,
    fieldDefs: Schema$ZohoField[],
    correlationKey?: string,
  ): { record: Schema$ZohoRecord | undefined; errors: string[] } {
    let result: { record: Schema$ZohoRecord | undefined; errors: string[] } = {
      record: undefined,
      errors: [] as string[],
    };

    switch (module) {
      case "leads":
      case "Leads":
        result = this.mapHullUserToZohoLead(
          hullProfileData,
          fieldDefs,
          correlationKey,
        );
        break;
      case "contacts":
      case "Contacts":
        result = this.mapHullUserToZohoContact(
          hullProfileData,
          fieldDefs,
          correlationKey,
        );
        break;
      case "accounts":
      case "Accounts":
        result = this.mapHullAccountToZohoAccount(
          hullProfileData,
          fieldDefs,
          correlationKey,
        );
        break;
      default:
        this.logger.warn(
          this.loggingUtil.composeOperationalMessage(
            "OPERATION_MAPPING_MODULE_UNSUPPORTED",
            correlationKey,
            `Unsupported module type '${module}' for mapping Hull Object to Zoho Record.`,
          ),
        );
        result = {
          record: undefined,
          errors: [
            `Unsupported module type '${module}' for mapping Hull Object to Zoho Record.`,
          ],
        };
        break;
    }

    return result;
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

  public mapHullEventsToZohoNotes(
    events: IHullUserEvent[],
    parentId: string,
    module: string,
  ): Schema$ZohoNoteCreate[] {
    const result: Schema$ZohoNoteCreate[] = [];
    if (
      isNil(this.appSettings.notes_events) ||
      this.appSettings.notes_events.length === 0
    ) {
      return result;
    }

    const filteredEvents = events.filter((e) => {
      return this.appSettings.notes_events!.includes(e.event);
    });

    if (filteredEvents.length === 0) {
      return result;
    }

    filteredEvents.forEach((e) => {
      let content = "";
      forIn(e.properties, (v, k) => {
        content += `${k}: ${v}`;
        content += "\n";
      });
      const pageUrl = get(e, "context.page.url");
      if (!!pageUrl) {
        content += `page_url: ${pageUrl}`;
        content += "\n";
      }

      result.push({
        Note_Content: content,
        Parent_Id: parentId,
        se_module: module,
        Note_Title: e.event,
      });
    });

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

  private mapHullUserToZohoLead(
    hullProfileData: any,
    fieldDefs: Schema$ZohoField[],
    correlationKey?: string,
  ): { record: Schema$ZohoRecord | undefined; errors: string[] } {
    let result = {
      record: undefined,
      errors: [] as string[],
    };

    forEach(this.appSettings.mapping_out_lead, (om) => {
      // Only handle valid mappings
      if (!isNil(om.hull) && !isNil(om.service)) {
        const fieldDef = fieldDefs.find((fd) => {
          return fd.api_name === om.service;
        });
        if (!isNil(fieldDef)) {
          const zohoValResult = this.mapHullValueToZohoValue(
            fieldDef,
            get(hullProfileData, om.hull, null),
            om.hull,
          );

          if (zohoValResult.errors.length === 0) {
            set(result, `record.${om.service}`, zohoValResult.zohoVal);
          } else {
            result.errors.push(...zohoValResult.errors);
          }
        }
      }
    });

    if (
      !isNil(get(hullProfileData, `traits_${ATTRIBUTE_GROUPS.lead}/id`, null))
    ) {
      set(
        result,
        "record.id",
        get(hullProfileData, `traits_${ATTRIBUTE_GROUPS.lead}/id`),
      );
    }
    return result;
  }

  private mapHullUserToZohoContact(
    hullProfileData: any,
    fieldDefs: Schema$ZohoField[],
    correlationKey?: string,
  ): { record: Schema$ZohoRecord | undefined; errors: string[] } {
    let result = {
      record: undefined,
      errors: [] as string[],
    };

    forEach(this.appSettings.mapping_out_contact, (om) => {
      // Only handle valid mappings
      if (!isNil(om.hull) && !isNil(om.service)) {
        const fieldDef = fieldDefs.find((fd) => {
          return fd.api_name === om.service;
        });
        if (!isNil(fieldDef)) {
          const zohoValResult = this.mapHullValueToZohoValue(
            fieldDef,
            get(hullProfileData, om.hull, null),
            om.hull,
          );

          if (zohoValResult.errors.length === 0) {
            set(result, `record.${om.service}`, zohoValResult.zohoVal);
          } else {
            result.errors.push(...zohoValResult.errors);
          }
        }
      }
    });

    if (
      !isNil(
        get(hullProfileData, `traits_${ATTRIBUTE_GROUPS.contact}/id`, null),
      )
    ) {
      set(
        result,
        "record.id",
        get(hullProfileData, `traits_${ATTRIBUTE_GROUPS.contact}/id`),
      );
    }
    return result;
  }

  private mapHullAccountToZohoAccount(
    hullProfileData: any,
    fieldDefs: Schema$ZohoField[],
    correlationKey?: string,
  ): { record: Schema$ZohoRecord | undefined; errors: string[] } {
    let result = {
      record: undefined,
      errors: [] as string[],
    };

    forEach(this.appSettings.mapping_out_account, (om) => {
      // Only handle valid mappings
      if (!isNil(om.hull) && !isNil(om.service)) {
        const fieldDef = fieldDefs.find((fd) => {
          return fd.api_name === om.service;
        });
        if (!isNil(fieldDef)) {
          const zohoValResult = this.mapHullValueToZohoValue(
            fieldDef,
            get(hullProfileData, om.hull, null),
            om.hull,
          );

          if (zohoValResult.errors.length === 0) {
            set(result, `record.${om.service}`, zohoValResult.zohoVal);
          } else {
            result.errors.push(...zohoValResult.errors);
          }
        }
      }
    });

    if (!isNil(get(hullProfileData, `${ATTRIBUTE_GROUPS.account}/id`, null))) {
      set(
        result,
        "record.id",
        get(hullProfileData, `${ATTRIBUTE_GROUPS.account}/id`),
      );
    }
    return result;
  }

  private mapHullValueToZohoValue(
    fieldDef: Schema$ZohoField,
    hullVal: any,
    hullAttribute: string,
  ): { zohoVal: any; errors: string[] } {
    let result = {
      zohoVal: undefined as any,
      errors: [] as string[],
    };

    switch (fieldDef.data_type) {
      // Handle string values
      case "email":
      case "picklist":
      case "text":
      case "textarea":
      case "website":
      case "lookup":
        let strVal = hullVal;
        if (isNil(hullVal)) {
          // Null and undefined need to be null
          result.zohoVal = null;
        } else {
          if (typeof hullVal !== "string") {
            strVal = `${hullVal}`;
          }
          // Validate the max length
          if (fieldDef.length >= (strVal as string).length) {
            if (
              fieldDef.data_type === "picklist" &&
              !fieldDef.pick_list_values
                .map((p) => p.actual_value)
                .includes(strVal)
            ) {
              result.errors.push(
                `Value '${strVal}' for Hull Attribute '${hullAttribute.replace(
                  "traits_",
                  "",
                )}' is not valid for Picklist Field '${
                  fieldDef.display_label
                }' in Zoho. Allowed values are ${fieldDef.pick_list_values
                  .map((p) => p.actual_value)
                  .join(", ")}.`,
              );
            } else {
              result.zohoVal = strVal;
            }
          } else {
            result.errors.push(
              `Value for Hull Attribute '${hullAttribute.replace(
                "traits_",
                "",
              )}' exceeds maximum length of ${fieldDef.length} for 'Field '${
                fieldDef.display_label
              }' in Zoho.`,
            );
          }
        }

        break;
      // Handle floating numbers
      case "currency":
      case "double":
        let numVal = hullVal;
        if (typeof hullVal === "string") {
          numVal = parseFloat(hullVal);
        }

        if (isNaN(numVal) || !isFinite(numVal)) {
          result.errors.push(
            `Value for Hull Attribute '${hullAttribute.replace(
              "traits_",
              "",
            )}' mapped to 'Field '${
              fieldDef.display_label
            }' in Zoho is not a finite number.`,
          );
        } else {
          result.zohoVal = numVal;
        }

        break;
      // Handle integer numbers
      case "integer":
      case "bigint":
        let intVal = hullVal;
        if (typeof hullVal === "string") {
          intVal = parseInt(hullVal, 10);
        }

        if (isNaN(intVal) || !isFinite(intVal)) {
          result.errors.push(
            `Value for Hull Attribute '${hullAttribute.replace(
              "traits_",
              "",
            )} mapped to 'Field '${
              fieldDef.display_label
            }' in Zoho is not a finite number.`,
          );
        } else {
          result.zohoVal = intVal;
        }
        break;
      // Handle datetime values (note: Zoho cannot handle ms in the ISO string)
      case "datetime":
        let dtVal;
        if (typeof hullVal === "string") {
          dtVal = DateTime.fromISO(hullVal);
        } else if (typeof hullVal === "number") {
          dtVal = DateTime.fromSeconds(hullVal);
        }

        if (isNil(hullVal)) {
          result.zohoVal = null;
        } else if (isNil(dtVal) || dtVal.isValid === false) {
          result.errors.push(
            `Value for Hull Attribute '${hullAttribute.replace(
              "traits_",
              "",
            )} mapped to 'Field '${
              fieldDef.display_label
            }' in Zoho is not a valid datetime value.`,
          );
        } else {
          result.zohoVal = dtVal
            .set({ millisecond: 0 })
            .toISO({ suppressMilliseconds: true });
        }
        break;
      // Handle date values
      case "date":
        let dVal;
        if (typeof hullVal === "string") {
          dVal = DateTime.fromISO(hullVal);
        } else if (typeof hullVal === "number") {
          dVal = DateTime.fromSeconds(hullVal);
        }

        if (isNil(hullVal)) {
          result.zohoVal = null;
        } else if (isNil(dVal) || dVal.isValid === false) {
          result.errors.push(
            `Value for Hull Attribute '${hullAttribute.replace(
              "traits_",
              "",
            )} mapped to 'Field '${
              fieldDef.display_label
            }' in Zoho is not a valid date value.`,
          );
        } else {
          result.zohoVal = dVal.toISODate();
        }
        break;
      // Handle boolean values
      case "boolean":
        if (typeof hullVal !== "boolean") {
          result.errors.push(
            `Value for Hull Attribute '${hullAttribute.replace(
              "traits_",
              "",
            )} mapped to 'Field '${
              fieldDef.display_label
            }' in Zoho is not a boolean.`,
          );
        } else {
          result.zohoVal = hullVal;
        }
        break;
      default:
        break;
    }

    return result;
  }
}
