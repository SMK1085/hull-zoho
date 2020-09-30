import { IHullAccountClaims } from "../types/account";

export type ApiMethod =
  | "delete"
  | "get"
  | "GET"
  | "DELETE"
  | "head"
  | "HEAD"
  | "options"
  | "OPTIONS"
  | "post"
  | "POST"
  | "put"
  | "PUT"
  | "patch"
  | "PATCH"
  | "link"
  | "LINK"
  | "unlink"
  | "UNLINK";

export interface ApiResultObject<TPayload, TData, TError> {
  endpoint: string;
  method: ApiMethod;
  payload: TPayload | undefined;
  data?: TData;
  success: boolean;
  error?: string | string[];
  errorDetails?: TError;
}

export type OutgoingOperationType = "upsert" | "skip";
export type OutgoingOperationObjectType = "user" | "event" | "account";

export interface OutgoingOperationEnvelope<TMessage, TServiceObject> {
  message: TMessage;
  serviceObject?: TServiceObject;
  operation: OutgoingOperationType;
  objectType: OutgoingOperationObjectType;
  notes?: string[];
}

export interface OutgoingOperationEnvelopesFiltered<TMessage, TServiceObject> {
  upserts: OutgoingOperationEnvelope<TMessage, TServiceObject>[];
  skips: OutgoingOperationEnvelope<TMessage, TServiceObject>[];
}

export interface ZohoOAuthResponse {
  state: string;
  code: string;
  location: string;
  "accounts-server": string;
}

export interface ZohoRefreshTokenResponse {
  access_token: string;
  api_domain: string;
  token_type: string;
  expires_in: number;
}

export interface ZohoTokenResponse extends ZohoRefreshTokenResponse {
  refresh_token: string;
}

export type Type$ZohoDataType =
  | "autonumber"
  | "text"
  | "picklist"
  | "integer"
  | "currency"
  | "boolean"
  | "ownerlookup"
  | "datetime"
  | "email"
  | "textarea"
  | "profileimage"
  | "website"
  | "formula"
  | "double"
  | "subform"
  | "multiselectlookup"
  | "lookup"
  | "date"
  | "bigint";

export type Type$ZohoJsonType =
  | "double"
  | "string"
  | "jsonobject"
  | "jsonarray";

export interface Schema$ZohoField {
  system_mandatory: boolean;
  webhook: boolean;
  json_type?: Type$ZohoJsonType;
  crypt: null | {
    mode: string;
    status: number;
  };
  field_label: string;
  tooltip: null | string;
  created_source: string;
  field_read_only: boolean;
  display_label: string;
  read_only: boolean;
  association_details: null;
  businesscard_supported: boolean;
  multi_module_lookup: {};
  currency: {
    rounding_option?: "normal" | "round_off" | "round_up" | "round_down";
    precision?: number;
  };
  id: string;
  custom_field: boolean;
  lookup: {
    display_label?: string;
    api_name?: string;
    module?: string;
    id?: string;
  };
  visible: boolean;
  length: number;
  view_type: {
    view: boolean;
    edit: boolean;
    quick_create: boolean;
    create: boolean;
  };
  subform: null | {
    module: string;
    id: string;
  };
  api_name: string;
  unique: {
    casesensitive?: string;
  };
  data_type: Type$ZohoDataType;
  formula: {
    return_type?:
      | "currency"
      | "decimal"
      | "string"
      | "date"
      | "datetime"
      | "boolean";
  };
  decimal_place: null | number;
  mass_update: boolean;
  multiselectlookup: {
    display_label?: string;
    linking_module?: string;
    lookup_apiname?: string;
    connected_module?: string;
    api_name?: string;
    connectedlookup_apiname?: string;
    id?: string;
  };
  pick_list_values: {
    display_value: string;
    actual_value: string;
  }[];
  auto_number: {
    prefix?: string;
    start_number?: number;
    suffix?: string;
  };
}

export interface Schema$GetFieldsRequestParams {
  module: string;
}

export interface Schema$GetFieldsResponse {
  fields: Schema$ZohoField[];
}

export interface Schema$ListOfRecordsRequestParams {
  module: string;
  fields?: string;
  sort_order?: "asc" | "desc";
  sort_by?: string;
  converted?: "true" | "false" | "both";
  approved?: "true" | "false" | "both";
  page?: number;
  per_page?: number; // defaults to 200
}

export interface Schema$ListOfRecordsResponse {
  data: Schema$ZohoRecord[];
  info: {
    per_page: number;
    count: number; // count on this page
    page: number;
    more_records: boolean;
  };
}

export interface Schema$GetSpecificRecordRequestParams {
  module: string;
  id: string;
}

export interface Schema$GetSpecificRecordResponse {
  data: Schema$ZohoRecord[];
}

export interface Schema$ZohoOwner {
  name: string;
  id: string;
  email: string;
}

export interface Schema$ZohoRecord {
  $currency_symbol?: string;
  $state?: string;
  $converted?: boolean;
  $process_flow?: boolean;
  id?: string;
  $approved?: boolean;
  $approval?: {
    delegate: boolean;
    approve: boolean;
    reject: boolean;
    resubmit: boolean;
  };
  $editable?: boolean;
  $review_process?: {
    approve: boolean;
    reject: boolean;
    resubmit: boolean;
  };
  $review?: null | any;
  $converted_detail?: {
    deal?: null | string;
    convert_date?: string;
    contact?: string;
    converted_by?: string;
    account?: string;
  };
  $orchestration?: boolean;
  $in_merge?: boolean;
  $approval_state?: string;
  [key: string]: any;
}

export interface Schema$ZohoNotification {
  channel_id: string; // long
  events: string[];
  channel_expiry: string; // ISO datetime
  notify_url: string;
  token?: string;
  resource_id?: string; // Read-only
  resource_uri?: string; // Read-only
}

export interface Schema$EnableNotificationsRequestParams {
  watch: Schema$ZohoNotification[];
}

export interface Schema$EnableNotificationsResponse {
  watch: {
    code: string;
    details: {
      events: {
        channel_expiry: string;
        resource_uri: string;
        resource_id: string;
        resource_name: string;
        channel_id: string;
      }[];
    };
    message: string;
    status: string;
  }[];
}

export interface Schema$GetNotificationDetailsRequestParams {
  page?: number;
  per_page?: number;
  channel_id: number; // long
  module?: string;
}

export interface Schema$GetNotificationDetailsResponse {
  watch: Schema$ZohoNotification[];
  info: {
    per_page: number;
    count: number;
    page: number;
    more_records: boolean;
  };
}

export interface Schema$ZohoNotificationRequest {
  query_params?: {
    [key: string]: any;
  };
  module: string;
  resource_uri: string;
  ids: string[];
  operation: string;
  channel_id: string;
  token?: string | null;
}

export interface Schema$ZohoUpsertObject {
  module: "Leads" | "Contacts" | "Accounts";
  data: { [key: string]: any };
}

export type Type$ZohoTrigger = "workflow" | "approval" | "blueprint";

export interface Schema$ZohoUpsertRecordsParams {
  module: string;
  data: Schema$ZohoRecord[];
  duplicate_check_fields?: string[];
  trigger?: Type$ZohoTrigger[];
}

export interface Schema$ZohoUpsertRecordsResponse {
  data: {
    code: string;
    duplicate_field: string | null;
    action: string;
    details: Schema$ZohoRecord;
    message: string;
    status: string;
  }[];
}

export interface Schema$ZohoModule {
  global_search_supported: boolean;
  deletable: boolean;
  description: string | null;
  creatable: boolean;
  inventory_template_supported: boolean;
  modified_time: string;
  plural_label: string;
  presence_sub_menu: boolean;
  triggers_supported: boolean;
  id: string;
  isBlueprintSupported: boolean;
  visibility: number;
  convertable: boolean;
  editable: boolean;
  emailTemplate_support: boolean;
  profiles: { name: string; id: string }[];
  filter_supported: boolean;
  show_as_tab: boolean;
  web_link: string | null;
  sequence_number: number;
  singular_label: string;
  viewable: boolean;
  api_supported: boolean;
  api_name: string;
  quick_create: boolean;
  modified_by: {
    name: string;
    id: string;
  };
  generated_type: string;
  feeds_required: boolean;
  scoring_supported: boolean;
  webform_supported: boolean;
  arguments: any[];
  module_name: string;
  business_card_field_limit: number;
  parent_module: {
    api_name?: string;
    id?: string;
  };
}

export interface Schema$ZohoModulesResponse {
  modules: Schema$ZohoModule[];
}
