import { Request, Response, RequestHandler, NextFunction } from "express";
import { AwilixContainer } from "awilix";
import { SyncAgent } from "../core/sync-agent";
import { Logger } from "winston";
import { cloneDeep } from "lodash";

export const oauthInitActionFactory = (): RequestHandler => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<unknown> => {
    let logger: Logger | undefined;
    let correlationKey: string | undefined;

    try {
      const scope = (req as any).scope as AwilixContainer;
      logger = scope.resolve<Logger>("logger");
      correlationKey = scope.resolve<string>("correlationKey");
      const syncAgent = new SyncAgent(scope);

      if (req.query.auth_action === "complete") {
        res.send(
          `<p>Authentication completed. You may close this window now.</p>`,
        );

        return next();
      }

      const redirectUri = syncAgent.getOAuthUri((req as any).hull.token);
      console.log(redirectUri);
      res.redirect(redirectUri);
      return Promise.resolve(true);
    } catch (error) {
      if (logger) {
        logger.error({
          code: `ERR-01-001`,
          message: `Unhandled exception at route '${req.method} ${req.url}'`,
          correlationKey,
          errorDetails: cloneDeep(error),
        });
      }
      res
        .status(500)
        .send({ message: "Unknown error", error: { message: error.message } });
      return Promise.resolve(false);
    }
  };
};

export const oauthCallbackActionFactory = (): RequestHandler => {
  return async (req: Request, res: Response): Promise<unknown> => {
    let logger: Logger | undefined;
    let correlationKey: string | undefined;

    try {
      const scope = (req as any).scope as AwilixContainer;
      logger = scope.resolve<Logger>("logger");
      correlationKey = scope.resolve<string>("correlationKey");
      const syncAgent = new SyncAgent(scope);

      await syncAgent.handleOAuthResponse(req.query as any);

      res.redirect(
        `/oauth?ship=${scope.resolve<string>(
          "hullAppId",
        )}&secret=${scope.resolve<string>(
          "hullAppSecret",
        )}&organization=${scope.resolve<string>(
          "hullAppOrganization",
        )}&auth_action=complete`,
      );
      return Promise.resolve(true);
    } catch (error) {
      if (logger) {
        logger.error({
          code: `ERR-01-001`,
          message: `Unhandled exception at route '${req.method} ${req.url}'`,
          correlationKey,
          errorDetails: cloneDeep(error),
        });
      }
      res
        .status(500)
        .send({ message: "Unknown error", error: { message: error.message } });
      return Promise.resolve(false);
    }
  };
};

export const oauthStatusActionFactory = (): RequestHandler => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<unknown> => {
    let logger: Logger | undefined;
    let correlationKey: string | undefined;

    try {
      const scope = (req as any).scope as AwilixContainer;
      logger = scope.resolve<Logger>("logger");
      correlationKey = scope.resolve<string>("correlationKey");
      const syncAgent = new SyncAgent(scope);
      const authStatus = await syncAgent.determineAuthStatus();
      res.status(authStatus.statusCode).send(authStatus);
      return Promise.resolve(true);
    } catch (error) {
      console.error(error);
      if (logger) {
        logger.error({
          code: `ERR-01-001`,
          message: `Unhandled exception at route '${req.method} ${req.url}'`,
          correlationKey,
          errorDetails: cloneDeep(error),
        });
      }
      res
        .status(500)
        .send({ message: "Unknown error", error: { message: error.message } });
      return Promise.resolve(false);
    }
  };
};
