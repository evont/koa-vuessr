const koa = require('koa');
const app = new koa();
const koaRouter = require('koa-router');
const serve = require('koa-static');
const ssr = require('koa-vuessr-middleware');
const router = new koaRouter();

app.use(serve(__dirname + '/dist'));
app.use(serve(__dirname + '/public'));

router.get('*', ssr(app, {
  isProd: true,
}));
app.use(router.routes());

app.listen(8888);