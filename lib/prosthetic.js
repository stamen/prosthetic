var url = require("url"),
    request = require("request"),
    version = "0.1.1";

var syringe = module.exports = function(config) {
  var ops = [],
      proxy,
      encoding = null,
      errorCode = 503,
      rewriteUrls = false,
      baseUrl,
      ignoreHeaders = [
        "connection",
        "keep-alive",
        "accept-encoding",
        "transfer-encoding"
      ],
      onlyHeaders;

  function inject(req, res, next) {
    var headers = req.headers,
        method = req.method.toLowerCase(),
        proxiedUrl = getProxiedUrl(req),
        params = {
          headers: headers,
          uri: proxiedUrl,
          encoding: encoding
        };
    headers.Host = proxy.host;
    // console.log("proxying:", proxiedUrl, headers);
    return request[method].call(null,
      params,
      function(error, response, body) {
        if (error) {
          console.warn("error:", req.url, error);
          return res.send(errorCode);
        }

        res.status(response.statusCode);

        Object.keys(response.headers).forEach(function(header) {
          var lower = header.toLowerCase();
          if (ignoreHeaders && ignoreHeaders.indexOf(lower) > -1) {
            return;
          } else if (!onlyHeaders || onlyHeaders.indexOf(lower) > -1) {
            res.set(header, response.headers[header]);
          }
        });

        if (isInjectable(response)) {

          // body is a buffer when encoding === null
          body = body.toString();

          // console.warn("+ injecting:", req.url);
          if (rewriteUrls && baseUrl) {
            // console.log("body.length before:", body.length);
            body = body.replace(new RegExp(baseUrl, "g"), "");
            // console.log("body.length after:", body.length);
          }

          if (ops.length) {
            console.time(req.url);
            ops.forEach(function(op) {
              // console.log("body.length before:", body.length);
              body = op(body, req);
              // console.log("body.length after:", body.length);
            });
            console.timeEnd(req.url);
          }

          res.set("content-length", body.length);

        } else {
          // console.warn("- passing through:", req.url);
        }

        return res.send(body);
      });
  }

  inject.proxy = function(proxyUrl) {
    if (!arguments.length) return proxy;
    proxy = url.parse(proxyUrl);
    if (proxy.protocol !== "http:") {
      throw new Error("Unsupported protocol: " + proxy.protocol);
    }
    return inject;
  };

  inject.ops = function(d) {
    if (!arguments.length) return ops;
    var op = syringe.operation(d);
    ops = op ? [op] : [];
    return inject;
  };

  inject.insert = function(op, index) {
    op = syringe.operation(op);
    ops.splice(index, 0, op);
    return inject;
  };

  inject.add = function(d) {
    var op = syringe.operation(d);
    if (op) {
      ops.push(op);
    } else {
      console.warn("bad operation:", d);
    }
    return inject;
  };

  inject.base = function(base) {
    if (!arguments.length) return baseUrl;
    baseUrl = base;
    return inject;
  };

  inject.encoding = function(enc) {
    if (!arguments.length) return encoding;
    encoding = enc;
    return inject;
  };

  inject.errorCode = function(code) {
    if (!arguments.length) return errorCode;
    errorCode = code;
    return inject;
  };

  inject.onlyHeaders = function(headers) {
    if (!arguments.length) return onlyHeaders;
    onlyHeaders = headers;
    return inject;
  };

  inject.rewriteUrls = function(rewrite) {
    if (!arguments.length) return rewriteUrls;
    rewriteUrls = !!rewrite;
    return inject;
  };

  function getProxiedUrl(req) {
    return [
      proxy.protocol, "//",
      proxy.host,
      req.url
    ].join("");
  }

  function isInjectable(response) {
    return response.headers["content-type"]
        && response.headers["content-type"].indexOf("html") > -1;
  }

  if (typeof config === "object") {
    for (var key in config) {
      if (inject.hasOwnProperty(key)) {
        inject[key].call(null, config[key]);
      } else {
        console.warn("unrecognized option:", key);
      }
    }
  } else if (typeof config === "string" || config instanceof String) {
    inject.proxy(proxy);
  } else if (config) {
    console.warn("ignoring invalid config:", config);
  }

  return inject;
};

syringe.operation = require("./operation");

syringe.version = version;
