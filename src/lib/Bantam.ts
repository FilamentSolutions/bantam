import fs from 'fs';
import path from 'path';

import Koa, { Context } from 'koa';
import KoaRouter from 'koa-router';
import koaBodyParser from 'koa-bodyparser';

import Logger from './services/Logger';

export interface BantamAction {
  fetchAll?: (ctx: Context) => void;
  fetchSingle?: (id: string, ctx: Context) => void;
  create?: (data: any, ctx: Context) => void;
  update?: (id: string, data: any, ctx: Context) => void;
  delete?: (id: string, ctx: Context) => void;
  [method: string]: any;
}

type Constructor<T> = new (...args: any) => T;

interface UserOptions {
  port?: number;
  devPort?: number;
  actionsFolder?: string;
  actionsIndexFile?: string;
  actionsFileExt?: string;
}

interface Config {
  port: number;
  devPort: number;
  actionsFolder: string;
  actionsIndexFile: string;
  actionsFileExt: string;
}

interface Dependencies {
  logger: Logger;
}

type HttpVerb = 'get' | 'post' | 'patch' | 'delete';

interface Route {
  method: string;
  verb: HttpVerb;
  url: string;
}

export interface Action {
  fileName: string;
  pathName: string;
  actionClass?: Constructor<BantamAction>;
  actionObj?: BantamAction;
  routes?: Route[];
}

interface MethodsDict {
  get: string[];
  post: string[];
  patch: string[];
  delete: string[];
}

class Bantam {
  readonly defaultConfig: Config = {
    port: 3000,
    devPort: 3000,
    actionsFolder: 'actions',
    actionsIndexFile: 'index',
    actionsFileExt: '.ts',
  };

  readonly logger: Logger;

  private app: Koa;

  private router: KoaRouter;

  private config: Config;

  private actions: Action[] = [];

  constructor(userOptions?: UserOptions, deps?: Dependencies) {
    const config = Object.assign(this.defaultConfig, userOptions);
    this.setConfig(config);
    this.logger = typeof deps === 'undefined' ? new Logger() : deps.logger;
    this.app = new Koa();
    this.router = new KoaRouter();
  }

  getConfig(): Config {
    return this.config;
  }

  setConfig(config: Config): void {
    this.config = config;
  }

  async readActionsFolder(): Promise<string[]> {
    const { actionsFolder } = this.getConfig();
    return new Promise((resolve) => {
      fs.readdir(actionsFolder, (error, files) => {
        if (error instanceof Error || typeof files === 'undefined') {
          this.logger.error(
            'Unable to read actions folder! Check `actionsFolder` config setting.',
          );
          return resolve([]);
        }
        resolve(files);
      });
    });
  }

  getActions(): Action[] {
    if (this.actions.length === 0) {
      this.logger.error(
        'You have no loaded actions. Check for files in the actions folder.',
      );
    }
    return this.actions;
  }

  logRoutes(): void {
    const actions = this.getActions();
    const routes: Route[] = [];
    for (const action of actions) {
      for (const route of action.routes) {
        routes.push(route);
      }
    }

    const routesToLog: string[] = [];
    routesToLog.push('Available Routes:\n');

    const stringToLength = (s: string): number => s.length;
    const reduceToLongest = (l: number, prev: number): number =>
      l > prev ? l : prev;
    const longestFileName = actions
      .map(({ fileName }) => fileName)
      .map(stringToLength)
      .reduce(reduceToLongest, 0);
    const longestUrl = routes
      .map(({ url }) => url)
      .map(stringToLength)
      .reduce(reduceToLongest, 0);
    const columnFormat = (s: string, l: number): string =>
      `${s}${' '.repeat(l - s.length)}`;

    for (const { fileName, routes } of actions) {
      for (const { method, verb, url } of routes) {
        routesToLog.push(
          `${columnFormat(verb, 6).toUpperCase()} -> ${columnFormat(
            url,
            longestUrl,
          )} -> ${columnFormat(fileName, longestFileName)} -> ${method}`,
        );
      }
    }

    this.logger.info(routesToLog.join('\n'));
  }

  async discoverActions(): Promise<Action[]> {
    const actionFiles = await this.readActionsFolder();
    const actions: Action[] = [];
    for (const fileName of actionFiles) {
      const pathName = encodeURI(fileName.replace(/\.[j|t]s/, ''));
      const action: Action = {
        fileName: fileName,
        pathName: pathName,
      };
      actions.push(action);
    }
    this.actions = actions;
    return actions;
  }

  requireActionFile(fileName: string): Constructor<BantamAction> | null {
    const { actionsFolder } = this.getConfig();

    try {
      // eslint-disable-next-line
      const ActionClass: Constructor<BantamAction> = require(path.join(
        process.cwd(),
        actionsFolder,
        fileName,
      ));
      return ActionClass;
    } catch (error) {
      this.logger.error(`Unable to load \`${fileName}\` action file.`);
    }
  }

  loadActions(): void {
    const actions = this.getActions();

    const loadedActions = actions.map(
      (action): Action => {
        const ActionClass = this.requireActionFile(action.fileName);
        if (ActionClass !== null) {
          action.actionClass = ActionClass;
          action.actionObj = new ActionClass();
          return action;
        }
      },
    );

    this.actions = loadedActions;
  }

  introspectMethods(actionClass: any): MethodsDict {
    const keys = Reflect.ownKeys(actionClass.prototype);
    const methodsDict: MethodsDict = {
      get: [],
      post: [],
      patch: [],
      delete: [],
    };
    const GET_METHOD_RE = /^(get\w*|fetchAll|fetchSingle)$/;
    const POST_METHOD_RE = /^(set\w*|create)$/;
    const PATCH_METHOD_RE = /^update$/;
    const DELETE_METHOD_RE = /^delete$/;
    for (const key of keys) {
      const propertyName = String(key);
      const isGetMethod = GET_METHOD_RE.test(propertyName);
      const isPostMethod = POST_METHOD_RE.test(propertyName);
      const isPatchMethod = PATCH_METHOD_RE.test(propertyName);
      const isDeleteMethod = DELETE_METHOD_RE.test(propertyName);
      if (isGetMethod) methodsDict.get.push(propertyName);
      if (isPostMethod) methodsDict.post.push(propertyName);
      if (isPatchMethod) methodsDict.patch.push(propertyName);
      if (isDeleteMethod) methodsDict.delete.push(propertyName);
    }
    return methodsDict;
  }

  makeUrl(pathName: string, method: string): string {
    const { actionsIndexFile } = this.getConfig();
    let url = actionsIndexFile === pathName ? '/' : `/${pathName}/`;
    const INDI_RES_RE = /^(fetchSingle|update|delete)$/;
    const isIndividualResource = INDI_RES_RE.test(method);
    if (isIndividualResource) {
      url = `${url}:id`;
    }
    const CUSTOM_METHOD_RE = /^[g|s]et\w*$/;
    const isCustomMethod = CUSTOM_METHOD_RE.test(method);
    if (isCustomMethod) {
      const slug = method
        .replace(/^[g|s]et/, '')
        .replace(/(?!^)([A-Z])/g, '-$1')
        .toLowerCase();
      url = `${url}${slug}/`;
    }
    return url;
  }

  makeRoutes(
    pathName: string,
    actionClass?: Constructor<BantamAction>,
  ): Route[] {
    if (typeof actionClass === 'undefined') return [];

    const methodsDict = this.introspectMethods(actionClass);
    const mapToRoute = (verb: HttpVerb) => (method: string): Route => ({
      method,
      verb,
      url: this.makeUrl(pathName, method),
    });
    const getRoutes = methodsDict.get.map(mapToRoute('get'));
    const postRoutes = methodsDict.post.map(mapToRoute('post'));
    const patchRoutes = methodsDict.patch.map(mapToRoute('patch'));
    const deleteRoutes = methodsDict.delete.map(mapToRoute('delete'));
    return [].concat(getRoutes, postRoutes, patchRoutes, deleteRoutes);
  }

  routeToMethod(
    actionObj: BantamAction,
    method: string,
  ): (ctx: Context, next: Promise<any>) => void {
    const CTX_ONLY_RE = /^(get\w*|fetchAll)$/;
    const CTX_ID_RE = /^(fetchSingle|delete)$/;
    const CTX_BODY_RE = /^(set\w*|create)$/;
    const CTX_ID_BODY_RE = /^update$/;

    const isContextOnly = CTX_ONLY_RE.test(method);
    const isContextId = CTX_ID_RE.test(method);
    const isContextBody = CTX_BODY_RE.test(method);
    const isContextIdBody = CTX_ID_BODY_RE.test(method);

    return (ctx: Context, next: Promise<any>): void => {
      const id = ctx.params.id;
      // @ts-expect-error
      const body = ctx.request.body;

      const args = [];
      if (isContextOnly) args.push(ctx);
      if (isContextId) args.push(id, ctx);
      if (isContextBody) args.push(body, ctx);
      if (isContextIdBody) args.push(id, body, ctx);

      args.push(next);

      actionObj[method](...args);
    };
  }

  bindRoutes(): void {
    const router = this.router;

    const actions = this.getActions();

    for (const action of actions) {
      const { pathName, actionClass, actionObj } = action;
      const routes = this.makeRoutes(pathName, actionClass);
      action.routes = routes;

      if (routes.length === 0) {
        this.logger.error(`No methods found for \`${pathName}\` action.`);
        continue;
      }

      for (const { method, verb, url } of routes) {
        try {
          router[verb](url, this.routeToMethod(actionObj, method));
          // routeToMethod is a bit obtuse, but it prevents
          // slow RegEx queries being run every request
          // effectively results in router[verb](url, (ctx) => action[method](...args));
        } catch (error) {
          this.logger.error(
            `Unable to bind method \`${method}\` from \`${pathName}\` action to route.`,
          );
        }
      }
    }

    this.actions = actions;
  }

  getApp(): Koa {
    if (typeof this.app === 'undefined') {
      this.logger.error('Koa application has not been initialised.');
    }
    return this.app;
  }

  getRouter(): Koa {
    if (typeof this.router === 'undefined') {
      this.logger.error('Koa router has not been defined.');
    }
    return this.router;
  }

  extend(callback: (koaApp: Koa) => Koa): Bantam;

  extend(
    callback: (koaApp: Koa, koaRouter: KoaRouter) => [Koa, KoaRouter],
  ): Bantam;

  extend(
    callback: (koaApp: Koa, koaRouter?: KoaRouter) => Koa | [Koa, KoaRouter],
  ): Bantam {
    const app = this.getApp();
    const router = this.getRouter();
    const extension = callback(app, router);
    const [extendedApp, extendedRouter] = Array.isArray(extension)
      ? extension
      : [extension];
    this.app = extendedApp;
    if (typeof extendedRouter !== 'undefined') {
      this.router = extendedRouter;
    }
    return this;
  }

  async run(): Promise<Bantam> {
    const app = this.getApp();

    await this.discoverActions();

    this.loadActions();

    this.bindRoutes();

    app
      .use(koaBodyParser())
      .use(this.router.routes())
      .use(this.router.allowedMethods());

    const { port, devPort } = this.getConfig();
    const listenPort = process.env.NODE_ENV === 'production' ? port : devPort;

    try {
      app.listen({ port: listenPort });
      this.logger.success(
        `Application loaded! Serving at http://localhost:${listenPort}/`,
      );
    } catch (error) {
      this.logger.error('Unable to start Bantam application!');
    }

    return this;
  }
}

export default Bantam;
