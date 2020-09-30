import {
  HullConnectorAttributeMapping,
  HullConnectorIdentityMapping,
} from "../types/hull-connector";

export interface PrivateSettings {
  zoho_location?: string | null;
  zoho_accounts_server?: string | null;
  refresh_token?: string | null;
  access_token?: string | null;
  api_domain?: string | null;
  token_type?: string | null;
  expires_in?: number | null;
  expires_at?: string | null;

  lead_synchronized_segments: string[];
  identity_in_lead: HullConnectorIdentityMapping[];
  mapping_in_lead: HullConnectorAttributeMapping[];
  mapping_out_lead: HullConnectorAttributeMapping[];

  contact_synchronized_segments: string[];
  identity_in_contact: HullConnectorIdentityMapping[];
  mapping_in_contact: HullConnectorAttributeMapping[];
  mapping_out_contact: HullConnectorAttributeMapping[];

  account_synchronized_segments: string[];
  identity_in_account: HullConnectorIdentityMapping[];
  mapping_in_account: HullConnectorAttributeMapping[];
  mapping_out_account: HullConnectorAttributeMapping[];

  notifications_channelid_base?: number | null;
  notifications_channelid_lead?: string | null;
  notifications_channelid_contact?: string | null;
  notifications_channelid_account?: string | null;

  batch_users_module?: "Leads" | "Contacts";
  zoho_modules?: string[] | null;
}

export interface LogPayload {
  channel: "operational" | "metric" | "error";
  component: string;
  code: string;
  message?: string | null;
  metricKey?: string | null;
  metricValue?: number | null;
  errorDetails?: any | null;
  errorMessage?: string | null;
  appId: string;
  tenantId: string;
  correlationKey?: string;
}
