import Bantam from '@flmnt/bantam';

const app = new Bantam();

if (process.env.NODE_ENV === 'production') {
  app.run().then(
    () => {},
    (error) => console.error(error),
  );
} else {
  app.run().then(
    (app) => app.logRoutes(),
    (error) => console.error(error),
  );
}
