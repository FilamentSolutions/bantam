import fs from 'fs';
import sinon from 'sinon';
import { Context } from 'koa';

import Bantam, { Action } from '../../src/lib/Bantam';

afterEach(() => {
  sinon.restore();
});

test('Can instantiate with default options', (): void => {
  const onShutdown = async (): Promise<void> => {};
  const app = new Bantam({
    onShutdown,
  });
  expect(app.getConfig()).toEqual({
    port: 3000,
    devPort: 3000,
    actionsFolder: 'actions',
    actionsIndexFile: 'index',
    actionsFileExt: '.ts',
    onShutdown,
  });
});

test('Can instantiate with some user options', (): void => {
  const onShutdown = async (): Promise<void> => {};
  const app = new Bantam({
    actionsFolder: 'test',
    actionsFileExt: '.js',
    onShutdown,
  });
  expect(app.getConfig()).toEqual({
    port: 3000,
    devPort: 3000,
    actionsFolder: 'test',
    actionsIndexFile: 'index',
    actionsFileExt: '.js',
    onShutdown,
  });
});

test('Can instantiate with all user options', (): void => {
  const onShutdown = async (): Promise<void> => {};
  const app = new Bantam({
    port: 80,
    devPort: 3001,
    actionsFolder: 'example',
    actionsIndexFile: 'other',
    actionsFileExt: '.jsx',
    onShutdown,
  });
  expect(app.getConfig()).toEqual({
    port: 80,
    devPort: 3001,
    actionsFolder: 'example',
    actionsIndexFile: 'other',
    actionsFileExt: '.jsx',
    onShutdown,
  });
});

test('Can set config programmatically', () => {
  const onShutdown = async (): Promise<void> => {};
  const app = new Bantam();
  const config = app.getConfig();
  config.port = 80;
  config.onShutdown = onShutdown;
  app.setConfig(config);
  expect(app.getConfig()).toStrictEqual({
    port: 80,
    devPort: 3000,
    actionsFolder: 'actions',
    actionsIndexFile: 'index',
    actionsFileExt: '.ts',
    onShutdown,
  });
});

test('Can read file names in actions folder', async () => {
  const app = new Bantam();
  const readdirStub = sinon.stub(fs, 'readdir');
  readdirStub.yields(null, ['index.ts', 'other.ts', 'test.ts', 'random.txt']);
  const actions = await app.readActionsFolder();
  expect(actions).toStrictEqual(['other.ts', 'test.ts', 'index.ts']);
});

test('Logs error if actions folder cannot be read', async () => {
  const mockLoggerError = jest.fn();
  const fakeLogger = { error: mockLoggerError };
  // @ts-expect-error
  const app = new Bantam(undefined, { logger: fakeLogger });
  const readdirStub = sinon.stub(fs, 'readdir');
  readdirStub.yields(new Error());
  const actions = await app.readActionsFolder();
  expect(actions).toStrictEqual([]);
  expect(mockLoggerError).toHaveBeenCalledWith(
    'Unable to read actions folder! Check `actionsFolder` config setting.',
  );
});

test('Can get action routes', () => {
  const app = new Bantam();
  // @ts-expect-error
  app.actions = 'mockActions';
  expect(app.getActions()).toBe('mockActions');
});

test('Logs error if no routes have been set', () => {
  const mockLoggerError = jest.fn();
  const fakeLogger = { error: mockLoggerError };
  // @ts-expect-error
  const app = new Bantam(undefined, { logger: fakeLogger });
  app.getActions();
  expect(mockLoggerError).toHaveBeenCalledWith(
    'You have no loaded actions. Check for files in the actions folder.',
  );
});

/* eslint-disable jsdoc/require-jsdoc */
class MockAction implements Action {
  fetchAll(ctx: Context): void {}

  fetchSingle(id: string, ctx: Context): void {}

  create(data: any, ctx: Context): void {}

  update(id: string, data: any, ctx: Context): void {}

  delete(id: string): void {}

  getCustom(ctx: Context): void {}

  setCustom(data: any, ctx: Context): void {}

  doCustom(id: string, data: any, ctx: Context): void {}

  private _privateMethod(): void {}
}
/* eslint-enable */

test('Can log routes', () => {
  const actionObject = new MockAction();
  const mockLoggerInfo = jest.fn();
  const fakeLogger = { info: mockLoggerInfo };
  // @ts-expect-error
  const app = new Bantam(undefined, { logger: fakeLogger });
  // @ts-expect-error
  app.actions = [
    {
      fileName: 'index.js',
      pathName: 'index',
      actionClass: MockAction,
      actionObj: actionObject,
      routes: [
        {
          method: 'fetchAll',
          verb: 'get',
          url: '/',
        },
        {
          method: 'fetchSingle',
          verb: 'get',
          url: '/:id',
        },
      ],
    },
  ];
  app.logRoutes();
  expect(mockLoggerInfo).toHaveBeenCalledWith(`Available Routes:

GET    -> /    -> index.js -> fetchAll
GET    -> /:id -> index.js -> fetchSingle
GET    -> /healthz [health check endpoint]`);
});

test('Discover actions turns filenames into filename and path', async () => {
  const app = new Bantam();
  const readActionsFolderStub = sinon.stub(app, 'readActionsFolder');
  readActionsFolderStub.returns(['index.js', 'auth-test.js']);
  const actions = await app.discoverActions();
  expect(actions).toStrictEqual([
    { fileName: 'index.js', pathName: 'index', routes: [] },
    { fileName: 'auth-test.js', pathName: 'auth-test', routes: [] },
  ]);
});

test('Throws error if action file cannot be loaded', () => {
  const mockLoggerError = jest.fn();
  const fakeLogger = { error: mockLoggerError };
  // @ts-expect-error
  const app = new Bantam(undefined, { logger: fakeLogger });
  app.requireActionFile('index.js');
  expect(mockLoggerError).toHaveBeenCalledWith(
    'Unable to load `index.js` action file.',
  );
});

test('Can load actions', async () => {
  const app = new Bantam();
  const readActionsFolderStub = sinon.stub(app, 'readActionsFolder');
  readActionsFolderStub.returns(['index.js', 'auth.js']);
  await app.discoverActions();
  const requireStub = sinon.stub(app, 'requireActionFile');
  requireStub.returns(MockAction);
  app.loadActions();
  const actions = app.getActions();
  expect(actions).toStrictEqual([
    {
      actionClass: MockAction,
      actionObj: new MockAction(),
      fileName: 'index.js',
      pathName: 'index',
      routes: [],
    },
    {
      actionClass: MockAction,
      actionObj: new MockAction(),
      fileName: 'auth.js',
      pathName: 'auth',
      routes: [],
    },
  ]);
});

test('Find action methods through introspection', () => {
  const app = new Bantam();
  const methods = app.introspectMethods(MockAction);
  expect(methods).toStrictEqual({
    get: ['fetchAll', 'fetchSingle', 'getCustom'],
    post: ['create', 'setCustom', 'doCustom'],
    patch: ['update'],
    delete: ['delete'],
  });
});

test('Can make default routes urls', () => {
  const app = new Bantam();
  expect(app.makeUrl('index', 'fetchAll')).toBe('/');
  expect(app.makeUrl('index', 'fetchSingle')).toBe('/:id');
  expect(app.makeUrl('index', 'create')).toBe('/');
  expect(app.makeUrl('index', 'update')).toBe('/:id');
  expect(app.makeUrl('index', 'delete')).toBe('/:id');
});

test('Can make custom resource route urls', () => {
  const app = new Bantam();
  expect(app.makeUrl('custom-action', 'fetchAll')).toBe('/custom-action/');
  expect(app.makeUrl('custom-action', 'fetchSingle')).toBe(
    '/custom-action/:id',
  );
  expect(app.makeUrl('custom-action', 'create')).toBe('/custom-action/');
  expect(app.makeUrl('custom-action', 'update')).toBe('/custom-action/:id');
  expect(app.makeUrl('custom-action', 'delete')).toBe('/custom-action/:id');
});

test('Can make custom method urls', () => {
  const app = new Bantam();
  expect(app.makeUrl('index', 'getMyCustomMethod')).toBe('/my-custom-method/');
  expect(app.makeUrl('foo', 'setYourMagicMethod')).toBe(
    '/foo/your-magic-method/',
  );
  expect(app.makeUrl('index', 'doMyCustomMethod')).toBe(
    '/my-custom-method/:id',
  );
});

test('Can make route objects from actionClass', () => {
  const app = new Bantam();
  const routes = app.makeRoutes('index', MockAction);
  expect(routes).toStrictEqual([
    {
      method: 'fetchAll',
      url: '/',
      verb: 'get',
    },
    {
      method: 'fetchSingle',
      url: '/:id',
      verb: 'get',
    },
    {
      method: 'getCustom',
      url: '/custom/',
      verb: 'get',
    },
    {
      method: 'create',
      url: '/',
      verb: 'post',
    },
    {
      method: 'setCustom',
      url: '/custom/',
      verb: 'post',
    },
    {
      method: 'doCustom',
      url: '/custom/:id',
      verb: 'post',
    },
    {
      method: 'update',
      url: '/:id',
      verb: 'patch',
    },
    {
      method: 'delete',
      url: '/:id',
      verb: 'delete',
    },
  ]);
});

test('Can route to fetchAll method with context only', () => {
  const app = new Bantam();
  const mockMethod = jest.fn();
  const fakeAction = { fetchAll: mockMethod };
  const ctx = { params: { id: 0 }, request: { body: 'test' } };
  const method = app.routeToMethod(fakeAction, 'fetchAll');
  // @ts-expect-error
  method(ctx).then(
    () => {},
    () => {},
  );
  expect(mockMethod).toHaveBeenCalledWith(ctx, undefined);
});

test('Can route to custom get method with context only', () => {
  const app = new Bantam();
  const mockMethod = jest.fn();
  const fakeAction = { getCustomMethod: mockMethod };
  const ctx = { params: { id: 0 }, request: { body: 'test' } };
  const method = app.routeToMethod(fakeAction, 'getCustomMethod');
  // @ts-expect-error
  method(ctx).then(
    () => {},
    () => {},
  );
  expect(mockMethod).toHaveBeenCalledWith(ctx, undefined);
});

test('Can route to fetchSingle method with id and context', () => {
  const app = new Bantam();
  const mockMethod = jest.fn();
  const fakeAction = { fetchSingle: mockMethod };
  const ctx = { params: { id: 0 }, request: { body: 'test' } };
  const method = app.routeToMethod(fakeAction, 'fetchSingle');
  // @ts-expect-error
  method(ctx).then(
    () => {},
    () => {},
  );
  expect(mockMethod).toHaveBeenCalledWith(0, ctx, undefined);
});

test('Can route to delete method with id and context', () => {
  const app = new Bantam();
  const mockMethod = jest.fn();
  const fakeAction = { delete: mockMethod };
  const ctx = { params: { id: 0 }, request: { body: 'test' } };
  const method = app.routeToMethod(fakeAction, 'delete');
  // @ts-expect-error
  method(ctx).then(
    () => {},
    () => {},
  );
  expect(mockMethod).toHaveBeenCalledWith(0, ctx, undefined);
});

test('Can route to create method with body and context', () => {
  const app = new Bantam();
  const mockMethod = jest.fn();
  const fakeAction = { create: mockMethod };
  const ctx = { params: { id: 0 }, request: { body: 'test' } };
  const method = app.routeToMethod(fakeAction, 'create');
  // @ts-expect-error
  method(ctx).then(
    () => {},
    () => {},
  );
  expect(mockMethod).toHaveBeenCalledWith('test', ctx, undefined);
});

test('Can route to custom set method with body and context', () => {
  const app = new Bantam();
  const mockMethod = jest.fn();
  const fakeAction = { setCustomMethod: mockMethod };
  const ctx = { params: { id: 0 }, request: { body: 'test' } };
  const method = app.routeToMethod(fakeAction, 'setCustomMethod');
  // @ts-expect-error
  method(ctx).then(
    () => {},
    () => {},
  );
  expect(mockMethod).toHaveBeenCalledWith('test', ctx, undefined);
});

test('Can route to update method with id, body and context', () => {
  const app = new Bantam();
  const mockMethod = jest.fn();
  const fakeAction = { update: mockMethod };
  const ctx = { params: { id: 0 }, request: { body: 'test' } };
  const method = app.routeToMethod(fakeAction, 'update');
  // @ts-expect-error
  method(ctx).then(
    () => {},
    () => {},
  );
  expect(mockMethod).toHaveBeenCalledWith(0, 'test', ctx, undefined);
});

// eslint-disable-next-line
class MockEmptyAction {}

test('Log error if no methods are found for an action', () => {
  const mockLoggerError = jest.fn();
  const fakeLogger = { error: mockLoggerError };
  // @ts-expect-error
  const app = new Bantam(undefined, { logger: fakeLogger });
  const getActionsStub = sinon.stub(app, 'getActions');
  getActionsStub.returns([
    {
      fileName: 'index.js',
      pathName: 'index',
      actionClass: MockEmptyAction,
      actionObj: new MockEmptyAction(),
    },
  ]);
  app.bindRoutes();
  expect(mockLoggerError).toHaveBeenCalledWith(
    'No methods found for `index` action.',
  );
});

/* eslint-disable jsdoc/require-jsdoc */
class MockSmallAction implements Action {
  fetchAll(ctx: Context): void {}
  fetchSingle(id: string, ctx: Context): void {}
}
/* eslint-enable */

test('Log error if no methods are found for an action', () => {
  const mockLoggerError = jest.fn();
  const fakeLogger = { error: mockLoggerError };
  // @ts-expect-error
  const app = new Bantam(undefined, { logger: fakeLogger });
  const getActionsStub = sinon.stub(app, 'getActions');
  getActionsStub.returns([
    {
      fileName: 'index.js',
      pathName: 'index',
      actionClass: MockSmallAction,
      actionObj: new MockSmallAction(),
    },
  ]);
  const routeToMethodStub = sinon.stub(app, 'routeToMethod');
  routeToMethodStub.throws();
  app.bindRoutes();
  expect(mockLoggerError).toHaveBeenCalledWith(
    'Unable to bind method `fetchAll` from `index` action to route.',
  );
  expect(mockLoggerError).toHaveBeenCalledWith(
    'Unable to bind method `fetchSingle` from `index` action to route.',
  );
});

test('Can bind routes to router', () => {
  const app = new Bantam();
  const mockRouterGet = jest.fn();
  // @ts-expect-error
  app.router = { get: mockRouterGet };
  const mockRouteToMethod = jest.fn();
  app.routeToMethod = mockRouteToMethod;
  const getActionsStub = sinon.stub(app, 'getActions');
  const mockActionObj = new MockSmallAction();
  getActionsStub.returns([
    {
      fileName: 'index.js',
      pathName: 'index',
      actionClass: MockSmallAction,
      actionObj: mockActionObj,
    },
  ]);
  app.bindRoutes();
  expect(mockRouterGet).toHaveBeenCalledWith('/', undefined);
  expect(mockRouteToMethod).toHaveBeenCalledWith(mockActionObj, 'fetchAll');
  expect(mockRouterGet).toHaveBeenCalledWith('/:id', undefined);
  expect(mockRouteToMethod).toHaveBeenCalledWith(mockActionObj, 'fetchSingle');
});

test('User can extend koa app with a callback', () => {
  const app = new Bantam();
  // @ts-expect-error
  app.app = 'koa';
  app.extend((koa) => {
    // @ts-expect-error
    koa = 'foo';
    return koa;
  });
  // @ts-expect-error
  expect(app.app).toBe('foo');
});

test('User can extend koa app and router with a callback', () => {
  const app = new Bantam();
  // @ts-expect-error
  app.app = 'koa';
  // @ts-expect-error
  app.router = 'router';
  // @ts-expect-error
  app.extend((koa, router) => {
    koa = 'foo';
    router = 'bar';
    return [koa, router];
  });
  expect(app.getApp()).toBe('foo');
  expect(app.getRouter()).toBe('bar');
});

test('Logs error if app is not ready when requested', () => {
  const mockLoggerError = jest.fn();
  const fakeLogger = { error: mockLoggerError };
  // @ts-expect-error
  const app = new Bantam(undefined, { logger: fakeLogger });
  // @ts-expect-error
  app.app = undefined;
  app.getApp();
  expect(mockLoggerError).toHaveBeenCalledWith(
    'Koa application has not been initialised.',
  );
});

test('Logs error if router is not ready when requested', () => {
  const mockLoggerError = jest.fn();
  const fakeLogger = { error: mockLoggerError };
  // @ts-expect-error
  const app = new Bantam(undefined, { logger: fakeLogger });
  // @ts-expect-error
  app.router = undefined;
  app.getRouter();
  expect(mockLoggerError).toHaveBeenCalledWith(
    'Koa router has not been defined.',
  );
});

test('Logs error on run if koa app startup throws', async () => {
  const mockLoggerError = jest.fn();
  const fakeLogger = { error: mockLoggerError };
  const fakeApp = {
    listen: () => {
      throw new Error();
    },
    use: function () {
      return this;
    },
  };
  // @ts-expect-error
  const app = new Bantam(undefined, { logger: fakeLogger });
  // @ts-expect-error
  app.app = fakeApp;
  await app.run();
  expect(mockLoggerError).toHaveBeenCalledWith(
    'Unable to start Bantam application!',
  );
});
