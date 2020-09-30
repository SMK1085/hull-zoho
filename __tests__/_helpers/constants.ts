import {
  HullConnectorAttributeMapping,
  HullConnectorIdentityMapping,
} from "../../src/types/hull-connector";
import manifest from "../../manifest.json";

// Define constants global to all tests here
export const ZOHO_LOCATION = "eu";
export const ZOHO_ACCOUNTS_SERVER = "https://accounts.zoho.eu";
export const ZOHO_REFRESH_TOKEN =
  "1000.2yphtjeukpeu7pprulp09r8j.3498qhyjstrosj";
export const ZOHO_ACCESS_TOKEN = "1000.9gh3pqjjtmnetyuu0epir.uhtphjmormjhlehj";
export const ZOHO_API_DOMAIN = "https://www.zohoapis.eu";
export const ZOHO_TOKEN_TYPE = "Bearer";
export const ZOHO_EXPIRES_IN = 3600;
export const REDIRECT_URL = "https://hull-zoho.eu.ngrok.io/oauth/callback";

export const APP_ID = "gqhqumjjw9ukkhkp";
export const TENANT_ID = "unittesting.hullapp.io";

export const MAPPING_IN_LEAD_DEFAULT: HullConnectorAttributeMapping[] = manifest.private_settings.find(
  (s) => s.name === "mapping_in_lead",
)!.default as HullConnectorAttributeMapping[];

export const IDENTITY_IN_LEAD_DEFAULT: HullConnectorIdentityMapping[] = manifest.private_settings.find(
  (s) => s.name === "identity_in_lead",
)!.default as HullConnectorIdentityMapping[];
