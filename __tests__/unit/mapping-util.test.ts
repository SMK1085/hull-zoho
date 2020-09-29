import { DateTime } from "luxon";
import { PrivateSettings } from "../../src/core/connector";
import {
  IDENTITY_IN_LEAD_DEFAULT,
  MAPPING_IN_LEAD_DEFAULT,
  ZOHO_ACCESS_TOKEN,
  ZOHO_ACCOUNTS_SERVER,
  ZOHO_API_DOMAIN,
  ZOHO_EXPIRES_IN,
  ZOHO_LOCATION,
  ZOHO_REFRESH_TOKEN,
  ZOHO_TOKEN_TYPE,
} from "../_helpers/constants";
import { LoggerMock, LoggingUtilMock } from "../_helpers/mocks";
import { MappingUtil } from "../../src/utils/mapping-util";
import ApiResultGetFieldsLeads from "../_data/api_getfields.json";
import ApiResultGetLeads from "../_data/api_getleads.json";
import { Schema$ZohoField } from "../../src/core/service-objects";
import {
  HullConnectorAttributeMapping,
  HullConnectorIdentityMapping,
} from "../../src/types/hull-connector";
import { unset } from "lodash";

describe("MappingUtil", () => {
  let loggerMock: any;
  let loggingUtilMock: any;
  let appSettings: PrivateSettings | undefined;

  beforeEach(() => {
    loggerMock = new LoggerMock();
    loggingUtilMock = new LoggingUtilMock();
    appSettings = {
      account_synchronized_segments: [],
      contact_synchronized_segments: [],
      identity_in_lead: [],
      identity_in_contact: [],
      identity_in_account: [],
      lead_synchronized_segments: [],
      mapping_in_account: [],
      mapping_in_contact: [],
      mapping_in_lead: [],
      mapping_out_account: [],
      mapping_out_contact: [],
      mapping_out_lead: [],
      access_token: ZOHO_ACCESS_TOKEN,
      api_domain: ZOHO_API_DOMAIN,
      expires_at: DateTime.utc().plus({ seconds: ZOHO_EXPIRES_IN }).toISO(),
      expires_in: ZOHO_EXPIRES_IN,
      refresh_token: ZOHO_REFRESH_TOKEN,
      token_type: ZOHO_TOKEN_TYPE,
      zoho_accounts_server: ZOHO_ACCOUNTS_SERVER,
      zoho_location: ZOHO_LOCATION,
    };
  });

  afterEach(() => {
    loggerMock = undefined;
    loggingUtilMock = undefined;
  });

  describe("#constructor()", () => {
    it("should initialize the read-only variables", () => {
      // Arrange
      const options = {
        hullAppSettings: appSettings,
        logger: loggerMock,
        loggingUtil: loggingUtilMock,
      };

      // Act
      const util = new MappingUtil(options);

      // Assert
      expect(util.appSettings).toEqual(appSettings);
      expect(util.logger).toBeDefined();
      expect(util.loggingUtil).toBeDefined();
    });
  });

  describe("#mapZohoRecordToHullIdent", () => {
    it("should map a lead record to Hull user identity if no mapping is required and service object has no identifier other than id", () => {
      // Arrange
      const defaultMappings = IDENTITY_IN_LEAD_DEFAULT;
      const configuredMappings: HullConnectorIdentityMapping[] = [];
      configuredMappings.push(...defaultMappings);
      const hullAppSettings = {
        ...appSettings,
        identity_in_lead: configuredMappings,
      };
      const options = {
        hullAppSettings,
        logger: loggerMock,
        loggingUtil: loggingUtilMock,
      };
      const util = new MappingUtil(options);
      const leadRecord = {
        ...ApiResultGetLeads.data[0],
      };
      unset(leadRecord, "Email");
      const fieldDefs: Schema$ZohoField[] = ApiResultGetFieldsLeads.fields as any;

      // Act
      const actual = util.mapZohoRecordToHullIdent(
        "leads",
        leadRecord,
        fieldDefs,
      );

      // Assert
      const expected = {
        anonymous_id: `zoho-lead:${leadRecord.id}`,
      };

      expect(actual).toEqual(expected);
    });

    it("should map a lead record to undefined if an email mapping is required and service object has no identifier other than id", () => {
      // Arrange
      const configuredMappings: HullConnectorIdentityMapping[] = [];
      configuredMappings.push({
        hull: "email",
        service: "Email",
        required: true,
      });
      const hullAppSettings = {
        ...appSettings,
        identity_in_lead: configuredMappings,
      };
      const options = {
        hullAppSettings,
        logger: loggerMock,
        loggingUtil: loggingUtilMock,
      };
      const util = new MappingUtil(options);
      const leadRecord = {
        ...ApiResultGetLeads.data[0],
      };
      unset(leadRecord, "Email");
      const fieldDefs: Schema$ZohoField[] = ApiResultGetFieldsLeads.fields as any;

      // Act
      const actual = util.mapZohoRecordToHullIdent(
        "leads",
        leadRecord,
        fieldDefs,
      );

      // Assert
      expect(actual).toBeUndefined();
    });

    it("should map a lead record to Hull user identity if email mapping is required and service object has all required identifiers", () => {
      // Arrange
      const configuredMappings: HullConnectorIdentityMapping[] = [];
      configuredMappings.push({
        hull: "email",
        service: "Email",
        required: true,
      });
      const hullAppSettings = {
        ...appSettings,
        identity_in_lead: configuredMappings,
      };
      const options = {
        hullAppSettings,
        logger: loggerMock,
        loggingUtil: loggingUtilMock,
      };
      const util = new MappingUtil(options);
      const leadRecord = {
        ...ApiResultGetLeads.data[0],
      };
      const fieldDefs: Schema$ZohoField[] = ApiResultGetFieldsLeads.fields as any;

      // Act
      const actual = util.mapZohoRecordToHullIdent(
        "leads",
        leadRecord,
        fieldDefs,
      );

      // Assert
      const expected = {
        email: leadRecord.Email,
        anonymous_id: `zoho-lead:${leadRecord.id}`,
      };

      expect(actual).toEqual(expected);
    });

    it("should not fail if an unsupported module is passed in but return undefined", () => {
      // Arrange
      const defaultMappings = IDENTITY_IN_LEAD_DEFAULT;
      const configuredMappings: HullConnectorIdentityMapping[] = [];
      configuredMappings.push(...defaultMappings);
      const hullAppSettings = {
        ...appSettings,
        identity_in_lead: configuredMappings,
      };
      const options = {
        hullAppSettings,
        logger: loggerMock,
        loggingUtil: loggingUtilMock,
      };
      const util = new MappingUtil(options);
      const leadRecord = {
        ...ApiResultGetLeads.data[0],
      };
      const fieldDefs: Schema$ZohoField[] = ApiResultGetFieldsLeads.fields as any;

      // Act
      const actual = util.mapZohoRecordToHullIdent(
        "foo",
        leadRecord,
        fieldDefs,
      );

      // Assert

      expect(actual).toBeUndefined();
      expect(loggerMock.warn).toHaveBeenCalled();
    });
  });

  describe("#mapZohoRecordToHullAttributes()", () => {
    it("should map a lead record to Hull user attributes", () => {
      // Arrange
      const defaultMappings = MAPPING_IN_LEAD_DEFAULT;
      const configuredMappings: HullConnectorAttributeMapping[] = [];
      configuredMappings.push(...defaultMappings);
      configuredMappings.push({
        hull: "zoho_lead/date1_date",
        service: "Date_1",
      });
      configuredMappings.push({
        hull: "zoho_lead/owner",
        service: "Owner",
      });
      configuredMappings.push({
        hull: "zoho_lead/estimated_mrr",
        service: "Estimated_MRR",
      });
      configuredMappings.push({
        hull: "zoho_lead/secret",
        service: "Secret",
      });
      configuredMappings.push({
        hull: "zoho_lead/decimal1",
        service: "Decimal_1",
      });
      configuredMappings.push({
        hull: "zoho_lead/salutation",
        service: "Salutation",
      });
      configuredMappings.push({
        hull: "zoho_lead/calculated_ARR",
        service: "Calculated_ARR",
      });
      configuredMappings.push({
        hull: "zoho_lead/incoming_requests",
        service: "Incoming_Requests",
      });
      configuredMappings.push({
        hull: "zoho_lead/next_meeting_date",
        service: "Next_Meeting",
      });
      configuredMappings.push({
        hull: "zoho_lead/email_opt_out",
        service: "Email_Opt_Out",
      });
      configuredMappings.push({
        hull: "zoho_lead/tracking_id",
        service: "Tracking_ID",
      });
      configuredMappings.push({
        hull: "zoho_lead/percent1",
        service: "Percent_1",
      });
      configuredMappings.push({
        hull: "zoho_lead/initial_campaign",
        service: "Initial_Campaign",
      });
      configuredMappings.push({
        hull: "zoho_lead/tag",
        service: "Tag",
      });
      const hullAppSettings = {
        ...appSettings,
        mapping_in_lead: configuredMappings,
      };
      const options = {
        hullAppSettings,
        logger: loggerMock,
        loggingUtil: loggingUtilMock,
      };
      const util = new MappingUtil(options);
      const leadRecord = ApiResultGetLeads.data[0];
      const fieldDefs: Schema$ZohoField[] = ApiResultGetFieldsLeads.fields as any;

      // Act
      const actual = util.mapZohoRecordToHullAttributes(
        "leads",
        leadRecord,
        fieldDefs,
      );

      // Assert
      const expected = {
        first_name: {
          value: leadRecord.First_Name,
          operation: "setIfNull",
        },
        last_name: {
          value: leadRecord.Last_Name,
          operation: "setIfNull",
        },
        "zoho_lead/company": {
          value: leadRecord.Company,
          operation: "set",
        },
        "zoho_lead/first_name": {
          value: leadRecord.First_Name,
          operation: "set",
        },
        "zoho_lead/last_name": {
          value: leadRecord.Last_Name,
          operation: "set",
        },
        "zoho_lead/email": {
          value: leadRecord.Email,
          operation: "set",
        },
        "zoho_lead/id": {
          value: leadRecord.id,
          operation: "setIfNull",
        },
        "zoho_lead/date1_date": {
          value: DateTime.fromISO(leadRecord.Date_1).toISO(),
          operation: "set",
        },
        "zoho_lead/owner_id": {
          value: leadRecord.Owner.id,
          operation: "set",
        },
        "zoho_lead/owner_name": {
          value: leadRecord.Owner.name,
          operation: "set",
        },
        "zoho_lead/owner_email": {
          value: leadRecord.Owner.email,
          operation: "set",
        },
        "zoho_lead/estimated_mrr": {
          value: leadRecord.Estimated_MRR,
          operation: "set",
        },
        "zoho_lead/secret": {
          value: leadRecord.Secret,
          operation: "set",
        },
        "zoho_lead/decimal1": {
          value: leadRecord.Decimal_1,
          operation: "set",
        },
        "zoho_lead/salutation": {
          value: leadRecord.Salutation,
          operation: "set",
        },
        "zoho_lead/calculated_ARR": {
          value: leadRecord.Calculated_ARR,
          operation: "set",
        },
        "zoho_lead/incoming_requests": {
          value: parseInt(leadRecord.Incoming_Requests, 10),
          operation: "set",
        },
        "zoho_lead/next_meeting_date": {
          value: DateTime.fromISO(leadRecord.Next_Meeting).toISO(),
          operation: "set",
        },
        "zoho_lead/email_opt_out": {
          value: leadRecord.Email_Opt_Out,
          operation: "set",
        },
        "zoho_lead/tracking_id": {
          value: leadRecord.Tracking_ID,
          operation: "set",
        },
        "zoho_lead/percent1": {
          value: leadRecord.Percent_1,
          operation: "set",
        },
        "zoho_lead/initial_campaign_id": {
          value: leadRecord.Initial_Campaign.id,
          operation: "set",
        },
        "zoho_lead/initial_campaign_name": {
          value: leadRecord.Initial_Campaign.name,
          operation: "set",
        },
        "zoho_lead/tag": {
          value: leadRecord.Tag,
          operation: "set",
        },
      };

      expect(actual).toEqual(expected);
    });
  });
});
