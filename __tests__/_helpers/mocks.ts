/* eslint-disable max-classes-per-file, @typescript-eslint/no-explicit-any, no-console */
import IHullClient from "../../src/types/hull-client";
import { PrivateSettings } from "../../src/core/connector";
import { LoggingUtil } from "../../src/utils/logging-util";
import { APP_ID, TENANT_ID } from "./constants";

const ClientMock: any = jest.fn<IHullClient, []>(() => ({
  configuration: {},
  api: jest.fn(() => Promise.resolve()),
  asAccount() {
    return this as any;
  },
  asUser() {
    return this as any;
  },
  del: jest.fn(() => Promise.resolve()),
  get: jest.fn(() => Promise.resolve()),
  logger: {
    info: jest.fn((msg, data) => console.log(msg, data)),

    debug: jest.fn((msg, data) => console.log(msg, data)),

    error: jest.fn((msg, data) => console.log(msg, data)),

    warn: jest.fn((msg, data) => console.log(msg, data)),

    log: jest.fn((msg, data) => console.log(msg, data)),

    silly: jest.fn((msg, data) => console.log(msg, data)),

    verbose: jest.fn((msg, data) => console.log(msg, data)),
  },
  post: jest.fn(() => Promise.resolve()),
  put: jest.fn(() => Promise.resolve()),
  utils: {},
  traits: jest.fn(() => Promise.resolve()),
  track: jest.fn(() => Promise.resolve()),
}));

class ConnectorMock {
  constructor(id: string, settings: any, privateSettings: PrivateSettings) {
    this.id = id;
    this.settings = settings;
    this.private_settings = privateSettings;
  }

  public id: string;

  public settings: any;

  public private_settings: PrivateSettings;
}

class ContextMock {
  constructor(id: string, settings: any, privateSettings: PrivateSettings) {
    this.ship = new ConnectorMock(id, settings, privateSettings);
    this.connector = new ConnectorMock(id, settings, privateSettings);
    this.client = new ClientMock();
    this.metric = {
      increment: jest.fn((name, value) => console.log(name, value)),
      value: jest.fn((name, value) => console.log(name, value)),
    };
  }

  // Public properties
  public ship: any;

  public connector: any;

  public client: IHullClient;

  public metric: any;
}

const LoggingUtilMock = jest.fn<LoggingUtil, []>(() => ({
  appId: APP_ID,
  tenantId: TENANT_ID,
  composeErrorMessage: jest.fn((id, errorDetails, correlationKey, message) => {
    return {
      appId: APP_ID,
      channel: "error",
      code: "ERR-00-000",
      component: "unit",
      tenantId: TENANT_ID,
      correlationKey,
      errorDetails,
      errorMessage: message ? message : "Unit testing error",
      message: message ? message : "Unit testing error",
    };
  }),
  composeMetricMessage: jest.fn((id, correlationKey, metricValue) => {
    return {
      appId: APP_ID,
      channel: "metric",
      code: "MET-00-000",
      component: "unit",
      tenantId: TENANT_ID,
      correlationKey,
      metricKey: "UNITTEST-METRIC",
      metricValue,
      message: `Captured metric 'UNITTEST-METRIC' with value of '${metricValue}'`,
    };
  }),
  composeOperationalMessage: jest.fn((id, correlationKey, message) => {
    return {
      appId: APP_ID,
      channel: "operational",
      code: "OPS-00-000",
      component: "unit",
      tenantId: TENANT_ID,
      correlationKey,
      message: message ? message : "Operational unit testing message.",
    };
  }),
}));

const LoggerMock = jest.fn(() => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

export { ClientMock, ConnectorMock, ContextMock, LoggingUtilMock, LoggerMock };

/* eslint-enable max-classes-per-file, @typescript-eslint/no-explicit-any, no-console */
