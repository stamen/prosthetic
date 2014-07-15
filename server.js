#!/usr/bin/env node
var fs = require("fs"),
    url = require("url"),
    path = require("path"),
    express = require("express"),
    DEFAULT_PORT = 8001,
    optimist = require("optimist")
      .usage([
        "Usage:",
        "1. with a proxy URL and one or more operation:",
        "   $0 --proxy URL [operations]",
        "2. with a JSON config and proxy URL:",
        "   $0 -c config.json --proxy URL [options] [operations]",
        "3. with a JSON config that includes the 'proxy' option:",
        "   $0 -c config.json [options] [operations]",
        "where [operations] is an optional list of JSON filenames\ncontaining operation specs."
      ].join("\n\n"))
      .option("proxy", {
        alias: "p",
        describe: "the URL to proxy (e.g. http://example.com)"
      })
      .option("rewrite", {
        alias: "r",
        boolean: true,
        describe: "whether to rewrite the proxy URL in each response"
      })
      .option("config", {
        alias: "c",
        describe: "the config file to load"
      })
      .option("static", {
        alias: "s",
        describe: "Where to serve static assets ('/url:local-path')"
      })
      .option("port", {
        alias: "P",
        describe: "the port on which to listen (default: " + DEFAULT_PORT + ")",
      }),
    argv = optimist.argv,
    argc = argv._,
    prosthetic = require("./index");

var operate,
    config = {
      proxy:        argv.proxy,
      rewriteUrls:  argv.rewrite,
      static:       argv.static
    };

if (argv.config) {
  try {
    var conf = JSON.parse(fs.readFileSync(argv.config));
  } catch (err) {
    console.error("unable to parse config from", argv.config, ":", err);
    return;
  }
  for (var key in conf) {
    config[key] = conf[key];
  }
}

if (!config.proxy && argc.length) {
  config.proxy = argc.shift();
  console.warn("no proxy declared, using the first argument:", config.proxy);
}

if (!config.proxy) {
  return optimist.showHelp();
} else if (config.proxy.indexOf("://") === -1) {
  config.proxy = "http://" + config.proxy;
}

var operate = prosthetic(config);
argc.forEach(function(filename) {
  try {
    var ops = JSON.parse(fs.readFileSync(filename));
  } catch (err) {
    console.warn("unable to parse config in", filename, ":", err);
  }
  console.log("+ adding ops from:", filename);
  operate.add(ops);
});

var app = express();

if (config.static) {
  var staticUrl = "/",
      staticPath = "";
  switch (typeof config.static) {
    case "object":
      staticUrl = config.static.url;
      staticPath = config.static.path;
      break;
    case "string":
      if (config.static.indexOf(":") > -1) {
        var bits = config.static.split(":", 2);
        staticUrl = bits[0];
        staticPath = bits[1];
      }
      break;
  }
  staticPath = path.resolve(process.cwd(), staticPath);
  console.warn("serving static assets on:", staticUrl, "from:", staticPath);
  app.use(staticUrl, express.static(staticPath));
}

app.use(operate);
app.listen(argv.port || process.env.PORT || DEFAULT_PORT, function() {
  var addr = this.address(),
      base = ["http://", addr.address, ":", addr.port].join("");
  operate.base(base);
  console.log("+ listening at:", base);
});
