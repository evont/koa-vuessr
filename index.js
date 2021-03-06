const fs = require('fs');
const path = require('path');
const { createBundleRenderer } = require('vue-server-renderer');
const LRU = require('lru-cache');
const log = require('./colorLog');
/**
 * deep extend object
 * @param {object} obj original object
 * @param {object} obj2 extend object
 * @returns {object} combine object
 */
function extend(obj, obj2) {
  const newObj = Object.assign({}, obj);
  for (const key in obj2) {
    if ('object' != typeof obj[key] || null === obj[key] || Array.isArray(obj[key])) {
      if (void 0 !== obj2[key]) {
        newObj[key] = obj2[key];
      }
    } else {
      newObj[key] = extend(obj[key], obj2[key]);
    }
  }
  return newObj;
}

function createRenderer(bundle, distPath, options) {
  return createBundleRenderer(
      bundle,
      Object.assign(options, {
          basedir: distPath,
          cache: LRU({
            max: 1000,
            maxAge: 1000 * 60 * 15
          }),
          runInNewContext: false
      })
  )
}

function render(renderer, title, ctx, ssrconfig) {
  ctx.set('Content-Type', 'text/html')
  const { errorPage = {} } = ssrconfig
  const handleError = err => {
    if (err.url) {
      ctx.redirect(err.url)
    } else if(err.code === 404) {
      if (errorPage['404']) {
        ctx.body = fs.createReadStream(errorPage['404']);
      } else {
        ctx.throw(404, err.toString())

      }
      // ctx.body = 'Page Not Found';
    } else {
      // Render Error Page or Redirect
      if (errorPage['500']) {
        ctx.body = fs.createReadStream(errorPage['500']);
      } else {
        ctx.body = err.stack || 'Internal Server Error';
      }
      // ctx.body = 'Internal Server Error';
    }
  }
  return new Promise((resolve, reject) => {
    const context = {
      title,
      url: ctx.url
    }
    renderer.renderToString(context, (err, html) => {
      if (err) {
        reject(err);
      } else {
        ctx.body = html;
        resolve();
      }
    })
  }).catch((error) => {
    handleError(error);
  })
}

let ssrconfig;
try {
  ssrconfig = fs.readFileSync(path.resolve(process.cwd(), '.ssrconfig'), 'utf-8');
} catch(e) {
  log.error('You need to have a .ssrconfig file in your root directory');
  throw new Error('no ssrconfig file')
}

ssrconfig = JSON.parse(ssrconfig);
const templatePath = ssrconfig.template || path.resolve(__dirname, 'index.template.html');

const distPath = path.resolve(process.cwd(), ssrconfig.output.path);

exports = module.exports = function(app, options = {}) {
  const defaultSetting = {
    title: '', // default title for html
    isProd: false, // is Production Mode
  };

  const settings = extend(defaultSetting, options);
  
  let renderer;
  let readyPromise;
  if (!settings.isProd) {
    readyPromise = require('./config/setup-dev-server')(
      app,
      templatePath,
      (bundle, options) => {
        renderer = createRenderer(bundle, distPath, options)
      }
    )
  }
  
  return async function ssr (ctx) {
    if (settings.isProd) {
      const template = fs.readFileSync(path.resolve(process.cwd(), templatePath), 'utf-8');
      const bundle = require(`${distPath}/vue-ssr-server-bundle.json`);
      const clientManifest = require(`${distPath}/vue-ssr-client-manifest.json`);
      renderer = createRenderer(bundle, distPath, {
        template,
        clientManifest
      });
      await render(renderer, settings.title, ctx, ssrconfig);
    } else {
      await readyPromise.then(() => render(renderer, settings.title, ctx, ssrconfig));
    }
  }
}

