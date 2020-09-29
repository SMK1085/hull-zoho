import { ServiceClient } from "../../src/core/service-client";
import nock from "nock";
import {
  ZOHO_ACCESS_TOKEN,
  ZOHO_ACCOUNTS_SERVER,
  ZOHO_API_DOMAIN,
  ZOHO_EXPIRES_IN,
  ZOHO_REFRESH_TOKEN,
  ZOHO_TOKEN_TYPE,
} from "../_helpers/constants";
import { AxiosError } from "axios";
import {
  ApiResultObject,
  Schema$GetFieldsRequestParams,
  Schema$GetFieldsResponse,
  Schema$ListOfRecordsRequestParams,
  Schema$ListOfRecordsResponse,
  ZohoRefreshTokenResponse,
  ZohoTokenResponse,
} from "../../src/core/service-objects";
import ApiResponseGetFields from "../_data/api_getfields.json";
import ApiResponseListRecords from "../_data/api_getleads.json";
import { cloneDeep } from "lodash";
import qs from "qs";

describe("ServiceClient", () => {
  beforeEach(() => {
    nock.cleanAll();
    nock.restore();

    if (!nock.isActive()) {
      nock.activate();
    }
  });

  afterEach(() => {
    nock.cleanAll();
    nock.restore();
  });

  describe("#constructor()", () => {
    it("should initialize all readonly variables", () => {
      // Arrange
      const options = {
        apiDomain: ZOHO_API_DOMAIN,
        accessToken: ZOHO_ACCESS_TOKEN,
      };

      // Act
      const client = new ServiceClient(options);

      // Assert
      expect(client.accessToken).toEqual(options.accessToken);
      expect(client.apiDomain).toEqual(options.apiDomain);
    });
  });

  describe("#generateTokens()", () => {
    it("should return the tokens upon success", async () => {
      // Arrange
      const options = {
        apiDomain: ZOHO_API_DOMAIN,
        accessToken: ZOHO_ACCESS_TOKEN,
      };
      const client = new ServiceClient(options);
      const code = "21to9gh0t4j0p35";
      const responsePayload = {
        access_token: ZOHO_ACCESS_TOKEN,
        api_domain: ZOHO_API_DOMAIN,
        token_type: ZOHO_TOKEN_TYPE,
        expires_in: ZOHO_EXPIRES_IN,
        refresh_token: ZOHO_REFRESH_TOKEN,
      };
      nock(ZOHO_ACCOUNTS_SERVER)
        .post("/oauth/v2/token")
        .matchHeader(
          "Content-Type",
          "application/x-www-form-urlencoded;charset=utf-8",
        )
        .reply(200, responsePayload, {
          "Content-Type": "application/json",
        });

      // Act
      const response = await client.generateTokens(ZOHO_ACCOUNTS_SERVER, code);

      // Assert
      const expected: ApiResultObject<
        undefined,
        ZohoTokenResponse,
        AxiosError
      > = {
        endpoint: `${ZOHO_ACCOUNTS_SERVER}/oauth/v2/token`,
        method: "post",
        payload: undefined,
        success: true,
        data: responsePayload,
      };

      expect(response).toEqual(expected);
    });

    it("should return an error result and not throw if API responds with status 500", async () => {
      // Arrange
      const options = {
        apiDomain: ZOHO_API_DOMAIN,
        accessToken: ZOHO_ACCESS_TOKEN,
      };
      const client = new ServiceClient(options);
      const code = "21to9gh0t4j0p35";
      nock(ZOHO_ACCOUNTS_SERVER)
        .post("/oauth/v2/token")
        .matchHeader(
          "Content-Type",
          "application/x-www-form-urlencoded;charset=utf-8",
        )
        .replyWithError("Some arbitrary error");

      // Act
      const response = await client.generateTokens(ZOHO_ACCOUNTS_SERVER, code);

      // Assert
      const expected: ApiResultObject<
        undefined,
        ZohoTokenResponse,
        AxiosError
      > = {
        endpoint: `${ZOHO_ACCOUNTS_SERVER}/oauth/v2/token`,
        method: "post",
        payload: undefined,
        success: false,
        error: "Some arbitrary error",
      };

      expect(response).toMatchObject(expected);
    });
  });

  describe("#refreshToken()", () => {
    it("should return the tokens upon success", async () => {
      // Arrange
      const options = {
        apiDomain: ZOHO_API_DOMAIN,
        accessToken: ZOHO_ACCESS_TOKEN,
      };
      const client = new ServiceClient(options);
      const refreshToken = ZOHO_REFRESH_TOKEN;
      const responsePayload = {
        access_token: ZOHO_ACCESS_TOKEN,
        api_domain: ZOHO_API_DOMAIN,
        token_type: ZOHO_TOKEN_TYPE,
        expires_in: ZOHO_EXPIRES_IN,
      };
      nock(ZOHO_ACCOUNTS_SERVER)
        .post("/oauth/v2/token")
        .matchHeader(
          "Content-Type",
          "application/x-www-form-urlencoded;charset=utf-8",
        )
        .reply(200, responsePayload, {
          "Content-Type": "application/json",
        });

      // Act
      const response = await client.refreshToken(
        ZOHO_ACCOUNTS_SERVER,
        refreshToken,
      );

      // Assert
      const expected: ApiResultObject<
        undefined,
        ZohoRefreshTokenResponse,
        AxiosError
      > = {
        endpoint: `${ZOHO_ACCOUNTS_SERVER}/oauth/v2/token`,
        method: "post",
        payload: undefined,
        success: true,
        data: responsePayload,
      };

      expect(response).toEqual(expected);
    });

    it("should return an error result and not throw if API responds with status 500", async () => {
      // Arrange
      const options = {
        apiDomain: ZOHO_API_DOMAIN,
        accessToken: ZOHO_ACCESS_TOKEN,
      };
      const client = new ServiceClient(options);
      const refreshToken = ZOHO_REFRESH_TOKEN;
      nock(ZOHO_ACCOUNTS_SERVER)
        .post("/oauth/v2/token")
        .matchHeader(
          "Content-Type",
          "application/x-www-form-urlencoded;charset=utf-8",
        )
        .replyWithError("Some arbitrary error");

      // Act
      const response = await client.refreshToken(
        ZOHO_ACCOUNTS_SERVER,
        refreshToken,
      );

      // Assert
      const expected: ApiResultObject<
        undefined,
        ZohoTokenResponse,
        AxiosError
      > = {
        endpoint: `${ZOHO_ACCOUNTS_SERVER}/oauth/v2/token`,
        method: "post",
        payload: undefined,
        success: false,
        error: "Some arbitrary error",
      };

      expect(response).toMatchObject(expected);
    });
  });

  describe("#getFields()", () => {
    it("should return the fields for the requested module upon success", async () => {
      // Arrange
      const options = {
        apiDomain: ZOHO_API_DOMAIN,
        accessToken: ZOHO_ACCESS_TOKEN,
      };
      const client = new ServiceClient(options);
      const responsePayload = cloneDeep(ApiResponseGetFields);
      const params = {
        module: "leads",
      };
      nock(ZOHO_API_DOMAIN)
        .get(`/crm/v2/settings/fields?module=${params.module}`)
        .matchHeader("authorization", `Zoho-oauthtoken ${ZOHO_ACCESS_TOKEN}`)
        .reply(200, responsePayload, {
          "Content-Type": "application/json",
        });

      // Act
      const response = await client.getFields(params);

      // Assert
      const expected: ApiResultObject<
        Schema$GetFieldsRequestParams,
        Schema$GetFieldsResponse,
        AxiosError
      > = {
        endpoint: `${ZOHO_API_DOMAIN}/crm/v2/settings/fields?module=${params.module}`,
        method: "get",
        payload: params,
        success: true,
        data: responsePayload as any,
      };

      expect(response).toEqual(expected);
    });

    it("should return an error result and not throw if API responds with status 500", async () => {
      // Arrange
      const options = {
        apiDomain: ZOHO_API_DOMAIN,
        accessToken: ZOHO_ACCESS_TOKEN,
      };
      const client = new ServiceClient(options);
      const params = {
        module: "leads",
      };
      nock(ZOHO_API_DOMAIN)
        .get(`/crm/v2/settings/fields?module=${params.module}`)
        .matchHeader("authorization", `Zoho-oauthtoken ${ZOHO_ACCESS_TOKEN}`)
        .replyWithError("Some arbitrary error");

      // Act
      const response = await client.getFields(params);

      // Assert
      const expected: ApiResultObject<
        Schema$GetFieldsRequestParams,
        Schema$GetFieldsResponse,
        AxiosError
      > = {
        endpoint: `${ZOHO_API_DOMAIN}/crm/v2/settings/fields?module=${params.module}`,
        method: "get",
        payload: params,
        success: false,
        error: "Some arbitrary error",
      };

      expect(response).toMatchObject(expected);
    });
  });

  describe("#listRecords()", () => {
    it("should return the records for the requested module upon success", async () => {
      // Arrange
      const options = {
        apiDomain: ZOHO_API_DOMAIN,
        accessToken: ZOHO_ACCESS_TOKEN,
      };
      const client = new ServiceClient(options);
      const responsePayload = cloneDeep(ApiResponseListRecords);
      const params = {
        module: "Leads",
      };
      nock(ZOHO_API_DOMAIN)
        .get(`/crm/v2/${params.module}`)
        .matchHeader("authorization", `Zoho-oauthtoken ${ZOHO_ACCESS_TOKEN}`)
        .reply(200, responsePayload, {
          "Content-Type": "application/json",
        });

      // Act
      const response = await client.listRecords(params);

      // Assert
      const expected: ApiResultObject<
        Schema$ListOfRecordsRequestParams,
        Schema$ListOfRecordsResponse,
        AxiosError
      > = {
        endpoint: `${ZOHO_API_DOMAIN}/crm/v2/${params.module}`,
        method: "get",
        payload: params,
        success: true,
        data: responsePayload,
      };

      expect(response).toEqual(expected);
    });

    it("should return the records with the given order for the requested module upon success", async () => {
      // Arrange
      const options = {
        apiDomain: ZOHO_API_DOMAIN,
        accessToken: ZOHO_ACCESS_TOKEN,
      };
      const client = new ServiceClient(options);
      const responsePayload = cloneDeep(ApiResponseListRecords);
      const params: Schema$ListOfRecordsRequestParams = {
        module: "Leads",
        sort_by: "Email",
        sort_order: "asc",
      };
      nock(ZOHO_API_DOMAIN)
        .get(
          `/crm/v2/${params.module}?${qs.stringify({
            sort_by: params.sort_by,
            sort_order: params.sort_order,
          })}`,
        )
        .matchHeader("authorization", `Zoho-oauthtoken ${ZOHO_ACCESS_TOKEN}`)
        .reply(200, responsePayload, {
          "Content-Type": "application/json",
        });

      // Act
      const response = await client.listRecords(params);

      // Assert
      const expected: ApiResultObject<
        Schema$ListOfRecordsRequestParams,
        Schema$ListOfRecordsResponse,
        AxiosError
      > = {
        endpoint: `${ZOHO_API_DOMAIN}/crm/v2/${params.module}?${qs.stringify({
          sort_by: params.sort_by,
          sort_order: params.sort_order,
        })}`,
        method: "get",
        payload: params,
        success: true,
        data: responsePayload,
      };

      expect(response).toEqual(expected);
    });

    it("should return an error result and not throw if API responds with status 500", async () => {
      // Arrange
      const options = {
        apiDomain: ZOHO_API_DOMAIN,
        accessToken: ZOHO_ACCESS_TOKEN,
      };
      const client = new ServiceClient(options);
      const params = {
        module: "Leads",
      };
      nock(ZOHO_API_DOMAIN)
        .get(`/crm/v2/${params.module}`)
        .matchHeader("authorization", `Zoho-oauthtoken ${ZOHO_ACCESS_TOKEN}`)
        .replyWithError("Some arbitrary error");

      // Act
      const response = await client.listRecords(params);

      // Assert
      const expected: ApiResultObject<
        Schema$ListOfRecordsRequestParams,
        Schema$ListOfRecordsResponse,
        AxiosError
      > = {
        endpoint: `${ZOHO_API_DOMAIN}/crm/v2/${params.module}`,
        method: "get",
        payload: params,
        success: false,
        error: "Some arbitrary error",
      };

      expect(response).toMatchObject(expected);
    });
  });
});
