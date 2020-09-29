import { statusActionFactory } from "./status";
import { accountUpdateHandlerFactory } from "./account-update";
import { metaActionFactory } from "./meta";
import {
  oauthInitActionFactory,
  oauthCallbackActionFactory,
  oauthStatusActionFactory,
} from "./oauth";
import { userUpdateHandlerFactory } from "./user-update";
import { fetchActionFactory } from "./fetch";
import { webhookActionFactory } from "./webhook";

export default {
  status: statusActionFactory,
  accountUpdate: accountUpdateHandlerFactory,
  userUpdate: userUpdateHandlerFactory,
  meta: metaActionFactory,
  oauthInit: oauthInitActionFactory,
  oauthCallback: oauthCallbackActionFactory,
  oauthStatus: oauthStatusActionFactory,
  fetch: fetchActionFactory,
  webhook: webhookActionFactory,
};
