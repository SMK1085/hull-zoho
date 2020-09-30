import {
  ApiResultObject,
  ApiMethod,
  ZohoTokenResponse,
  ZohoRefreshTokenResponse,
  Schema$GetFieldsRequestParams,
  Schema$GetFieldsResponse,
  Schema$ListOfRecordsRequestParams,
  Schema$ListOfRecordsResponse,
  Schema$ZohoNotification,
  Schema$EnableNotificationsRequestParams,
  Schema$EnableNotificationsResponse,
  Schema$GetNotificationDetailsRequestParams,
  Schema$GetNotificationDetailsResponse,
  Schema$GetSpecificRecordRequestParams,
  Schema$GetSpecificRecordResponse,
  Schema$ZohoUpsertRecordsParams,
  Schema$ZohoUpsertRecordsResponse,
  Schema$ZohoModulesResponse,
} from "../core/service-objects";
import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { ApiUtil } from "../utils/api-util";
import qs from "qs";
import { capitalize, identity, isNil, omit, pickBy } from "lodash";

export class ServiceClient {
  public readonly apiDomain: string;
  public readonly accessToken: string;

  constructor(options: any) {
    this.apiDomain = options.apiDomain;
    this.accessToken = options.accessToken;
  }

  public async generateTokens(
    accountsUrl: string,
    code: string,
  ): Promise<ApiResultObject<undefined, ZohoTokenResponse, AxiosError>> {
    const url = `${accountsUrl}/oauth/v2/token`;
    const method: ApiMethod = "post";
    const bodyFormData = qs.stringify({
      grant_type: "authorization_code",
      client_id: process.env.ZOHO_CLIENT_ID as string,
      client_secret: process.env.ZOHO_CLIENT_SECRET as string,
      redirect_uri: isNil(process.env.ZOHO_CALLBACK_URL)
        ? "https://hull-zoho.eu.ngrok.io/oauth/callback"
        : process.env.ZOHO_CALLBACK_URL,
      code,
    });

    try {
      const response = await axios.post<ZohoTokenResponse>(url, bodyFormData, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
      });

      return ApiUtil.handleApiResultSuccess(
        url,
        method,
        undefined,
        response.data,
      );
    } catch (error) {
      return ApiUtil.handleApiResultError(url, method, undefined, error);
    }
  }

  public async refreshToken(
    accountsUrl: string,
    refreshToken: string,
  ): Promise<ApiResultObject<undefined, ZohoRefreshTokenResponse, AxiosError>> {
    const url = `${accountsUrl}/oauth/v2/token`;
    const method: ApiMethod = "post";
    const bodyFormData = qs.stringify({
      refresh_token: refreshToken,
      client_id: process.env.ZOHO_CLIENT_ID as string,
      client_secret: process.env.ZOHO_CLIENT_SECRET as string,
      grant_type: "refresh_token",
    });

    try {
      const response = await axios.post<ZohoRefreshTokenResponse>(
        url,
        bodyFormData,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
          },
        },
      );

      return ApiUtil.handleApiResultSuccess(
        url,
        method,
        undefined,
        response.data,
      );
    } catch (error) {
      return ApiUtil.handleApiResultError(url, method, undefined, error);
    }
  }

  public async getFields(
    params: Schema$GetFieldsRequestParams,
  ): Promise<
    ApiResultObject<
      Schema$GetFieldsRequestParams,
      Schema$GetFieldsResponse,
      AxiosError
    >
  > {
    const url = `${this.apiDomain}/crm/v2/settings/fields?module=${params.module}`;
    const method: ApiMethod = "get";

    try {
      const response = await axios.get<Schema$GetFieldsResponse>(
        url,
        this.getApiDomainRequestConfig(),
      );
      return ApiUtil.handleApiResultSuccess(url, method, params, response.data);
    } catch (error) {
      return ApiUtil.handleApiResultError(url, method, params, error);
    }
  }

  public async listRecords(
    params: Schema$ListOfRecordsRequestParams,
  ): Promise<
    ApiResultObject<
      Schema$ListOfRecordsRequestParams,
      Schema$ListOfRecordsResponse,
      AxiosError
    >
  > {
    const qsParams = pickBy(omit(params, ["module"]), identity);
    let qsString = "";
    if (Object.keys(qsParams).length > 0) {
      qsString = `?${qs.stringify(qsParams)}`;
    }
    const url = `${this.apiDomain}/crm/v2/${capitalize(
      params.module,
    )}${qsString}`;
    const method: ApiMethod = "get";

    try {
      const response = await axios.get<Schema$ListOfRecordsResponse>(
        url,
        this.getApiDomainRequestConfig(),
      );
      return ApiUtil.handleApiResultSuccess(url, method, params, response.data);
    } catch (error) {
      return ApiUtil.handleApiResultError(url, method, params, error);
    }
  }

  public async getSpecificRecord(
    params: Schema$GetSpecificRecordRequestParams,
  ): Promise<
    ApiResultObject<
      Schema$GetSpecificRecordRequestParams,
      Schema$GetSpecificRecordResponse,
      AxiosError
    >
  > {
    const url = `${this.apiDomain}/crm/v2/${capitalize(params.module)}/${
      params.id
    }`;
    const method: ApiMethod = "get";

    try {
      const response = await axios.get<Schema$GetSpecificRecordResponse>(
        url,
        this.getApiDomainRequestConfig(),
      );
      return ApiUtil.handleApiResultSuccess(url, method, params, response.data);
    } catch (error) {
      return ApiUtil.handleApiResultError(url, method, params, error);
    }
  }

  public async enableNotifications(
    params: Schema$EnableNotificationsRequestParams,
  ): Promise<
    ApiResultObject<
      Schema$EnableNotificationsRequestParams,
      Schema$EnableNotificationsResponse,
      AxiosError
    >
  > {
    const url = `${this.apiDomain}/crm/v2/actions/watch`;
    const method: ApiMethod = "post";

    try {
      const response = await axios.post<Schema$EnableNotificationsResponse>(
        url,
        params,
        this.getApiDomainRequestConfig(),
      );
      return ApiUtil.handleApiResultSuccess(url, method, params, response.data);
    } catch (error) {
      return ApiUtil.handleApiResultError(url, method, params, error);
    }
  }

  public async getNotificationDetails(
    params: Schema$GetNotificationDetailsRequestParams,
  ): Promise<
    ApiResultObject<
      Schema$GetNotificationDetailsRequestParams,
      Schema$GetNotificationDetailsResponse,
      AxiosError
    >
  > {
    const qsParams = pickBy(params, identity);
    let qsString = "";
    if (Object.keys(qsParams).length > 0) {
      qsString = `?${qs.stringify(qsParams)}`;
    }
    const url = `${this.apiDomain}/crm/v2/actions/watch${qsString}`;
    const method: ApiMethod = "get";

    try {
      const response = await axios.get<Schema$GetNotificationDetailsResponse>(
        url,
        this.getApiDomainRequestConfig(),
      );
      return ApiUtil.handleApiResultSuccess(url, method, params, response.data);
    } catch (error) {
      return ApiUtil.handleApiResultError(url, method, params, error);
    }
  }

  public async updateNotificationDetails(
    params: Schema$EnableNotificationsRequestParams,
  ): Promise<
    ApiResultObject<
      Schema$EnableNotificationsRequestParams,
      Schema$EnableNotificationsResponse,
      AxiosError
    >
  > {
    const url = `${this.apiDomain}/crm/v2/actions/watch`;
    const method: ApiMethod = "put";

    try {
      const response = await axios.put<Schema$EnableNotificationsResponse>(
        url,
        params,
        this.getApiDomainRequestConfig(),
      );
      return ApiUtil.handleApiResultSuccess(url, method, params, response.data);
    } catch (error) {
      return ApiUtil.handleApiResultError(url, method, params, error);
    }
  }

  public async upsertRecords(
    params: Schema$ZohoUpsertRecordsParams,
  ): Promise<
    ApiResultObject<
      Schema$ZohoUpsertRecordsParams,
      Schema$ZohoUpsertRecordsResponse,
      AxiosError
    >
  > {
    const url = `${this.apiDomain}/crm/v2/${params.module}/upsert`;
    const method: ApiMethod = "post";

    try {
      const response = await axios.post<Schema$ZohoUpsertRecordsResponse>(
        url,
        omit(params, ["module"]),
        this.getApiDomainRequestConfig(),
      );
      return ApiUtil.handleApiResultSuccess(url, method, params, response.data);
    } catch (error) {
      return ApiUtil.handleApiResultError(url, method, params, error);
    }
  }

  public async listModules(): Promise<
    ApiResultObject<undefined, Schema$ZohoModulesResponse, AxiosError>
  > {
    const url = `${this.apiDomain}/crm/v2/settings/modules`;
    const method: ApiMethod = "get";

    try {
      const response = await axios.get<Schema$ZohoModulesResponse>(
        url,
        this.getApiDomainRequestConfig(),
      );
      return ApiUtil.handleApiResultSuccess(
        url,
        method,
        undefined,
        response.data,
      );
    } catch (error) {
      return ApiUtil.handleApiResultError(url, method, undefined, error);
    }
  }

  private getApiDomainRequestConfig(): AxiosRequestConfig {
    return {
      headers: {
        authorization: `Zoho-oauthtoken ${this.accessToken}`,
      },
    };
  }
}
