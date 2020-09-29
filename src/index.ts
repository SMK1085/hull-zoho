import express from "express";
import Hull from "hull";
import { server } from "./server";
import { json } from "body-parser";
import { isNil, get, set } from "lodash";

require("dotenv").config();

if (process.env.LOG_LEVEL) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((Hull as any).logger.transports as any).console.level =
    process.env.LOG_LEVEL;
}

const config = {
  hostSecret: process.env.SECRET || "SECRET",
  port: process.env.PORT || 8086,
  timeout: process.env.CLIENT_TIMEOUT || "25s",
};

const connector = new (Hull as any).Connector(config);
const app = express();

app.use(json(), (req, res, next) => {
  // Note: This is because Zoho doesn't send query string parameters as such
  //       in webhook notifications.
  console.log(">>> Request body", req.body);
  if (!isNil(get(req, "body.query_params.token", null))) {
    set(req, "query.token", get(req, "body.query_params.token"));
  }
  next();
});

connector.setupApp(app);

server(app);
connector.startApp(app);
