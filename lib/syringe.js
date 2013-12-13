var url = require("url"),
    request = require("request");

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

/*
syringe.injection = function(obj) {
  var injection;

  if (typeof obj === "function") {

    return obj;

  } else if (typeof obj === "string" || obj instanceof String) {

    // is this a url?
    if (obj.charAt(0) !== "<") {
      var url = obj,
          ext = url.split(".").pop();
      switch (ext) {
        case "js":
          return syringe.injection.script(url);
        case "css":
          return syringe.injection.style(url);
      }
    }
    return syringe.injection.payload(obj);

  } else if (typeof obj === "object") {

    if (obj.replace) {
      return syringe.replace(obj.replace, obj["with"])
        .once(obj.once);
    } 

    switch (obj.type) {
      case "element":
        injection = syringe.injection.element(obj.name);
        if (obj.attrs) injection.attributes(obj.attrs);
        if (obj.content) injection.content(obj.content);
        break;

      case "script":
        injection = syringe.injection.script(obj.url);
        for (var key in obj) {
          if (key !== "url") injection.attr(key, obj[key]);
        }
        break;

      case "style":
        injection = syringe.injection.style(obj.url, obj.element);
        for (var key in obj) {
          if (["element", "url"].indexOf(key) === -1) {
            injection.attr(key, obj[key]);
          }
        }
        break;

      default:
        if (Array.isArray(obj)) {
          injection = syringe.injection.array(obj);
        } else {
          // console.log("routes:", obj);
          injection = syringe.injection.routes(obj);
        }
        break;
    }

    if (obj.before) {
      injection.before(obj.before);
    } else if (obj.after) {
      injection.after(obj.after);
    }

    if (obj.valid) {
      injection.valid(obj.valid);
    }
  }

  return injection;
};

syringe.replace = function(a, b) {
  var once = false,
      html = true,
      path,
      valid = function() { return true; };

  function replace(body, req) {
    if (!valid(req)) return body;

    if (!html) {
      body.replace(/>([^<]+)</g, function(str, content) {
        return [">", content.replace(a, b), "<"].join("");
      });
    }

    return body.replace(a, b);
  }

  replace.once = function(bool) {
    if (!arguments.length) return once;
    once = !!bool;
    if (once) {
      if (a instanceof RegExp) {
        a.flags = a.flags.replace(/g/g, "");
      }
    } else {
      if (a instanceof RegExp) {
        a.flags += "g";
      } else {
        a = new RegExp(a.replace(/[\[\]\(\)\.\+\*]/g, function(s, c) {
          return "\\" + c;
        }));
      }
    }
    return replace;
  };

  replace.html = function(bool) {
    if (!arguments.length) return html;
    html = !!bool;
    return replace;
  };

  replace.before = function(marker) {
    if (!arguments.length) return undefined;
    console.warn("syringe.replace() has no before()");
    return replace;
  };

  replace.after = function(marker) {
    if (!arguments.length) return undefined;
    console.warn("syringe.replace() has no after()");
    return replace;
  };

  replace.valid = function(d) {
    if (!arguments.length) return valid;
    // XXX we'll need to implement this first
    valid = syringe.validate(d);
    return replace;
  };

  replace.path = function(uri) {
    if (!arguments.length) return path;
    path = new RegExp(uri.replace("*", ".*"));
    return replace;
  };

  replace.validate = function(req) {
    return valid(req)
        || !path
        || req.path.match(path);
  };

  return replace;
};

syringe.rewrite = function(rewrite) {
  var rewriter;
  switch (typeof rewrite) {
    case "function":
      return rewrite;

    case "string":
      throw new Error("I don't know what to do with a single rewrite string yet!");

    case "object":
      var rewriters = [];
      if (Array.isArray(rewrite)) {
        rewriters = rewrite.map(syringe.rewrite);
      } else {
        for (var key in obj) {
          rewriters.push(syringe.rewrite(key, obj[key]));
        }
      }

      if (obj.type === "urls") {
        rewriter = syringe.rewrite.urls()
          .base(obj.base);
        break;
      }

      var len = rewriters.length;
      rewriter = function(body, req) {
        for (var i = 0; i < len; i++) {
          body = rewriters[i].call(null, body, req);
        }
        return body;
      };
      break;

    case "boolean":
      if (rewrite) {
        return syringe.rewrite.urls();
      } else {
        return function(body) { return body; };
      }
  }

  return rewriter;
};

syringe.injection.payload = function(payload) {
  var before = null,
      after = "</head>",
      path,
      valid = function() { return true; };

  function injection(body, req) {
    if (!body || !body.length) return body;
    if (!injection.validate(req)) return body;

    var payload = injection.payload();
    if (before) {
      return body.replace(before, payload + before);
    } else if (after) {
      return body.replace(after, after + payload);
    } else {
      return body + payload;
    }
  }

  injection.validate = function(req) {
    console.log("validate:", req.path, path);
    return valid(req)
        || !path
        || req.path.match(path);
  };

  injection.payload = function(req) {
    return (typeof payload === "function")
      ? payload.call(null, req)
      : payload;
  };

  injection.before = function(marker) {
    if (!arguments.length) return before;
    before = marker;
    return injection;
  };

  injection.after = function(marker) {
    if (!arguments.length) return after;
    after = marker;
    return injection;
  };

  injection.valid = function(d) {
    if (!arguments.length) return valid;
    valid = syringe.validate(d);
    return injection;
  };

  injection.path = function(uri) {
    if (!arguments.length) return path;
    path = new RegExp(uri.replace("*", ".*"));
    return injection;
  };

  return injection;
};

syringe.injection.array = function(list) {
  var ops = list.map(syringe.injection);
  return syringe.injection(function(body, req) {
    ops.forEach(function(op) {
      body = op(body, req);
    });
    return body;
  });
};

syringe.injection.element = function(name, _attrs) {
  var attrs = {},
      closed = false,
      ownLine = true,
      content,
      selfClosingElements = "link".split(" ");

  var injection = syringe.injection.payload(function() {
    var out = ["<", name];
    if (ownLine) out.unshift("\n");
    for (var key in attrs) {
      // TODO escape attribute value properly
      out.push(" ", key, '="', attrs[key].replace(/"/g, '\\"'), '"');
    }
    if (content) {
      out.push(">", content, "</", name, ">");
    } else if (closed || selfClosingElements.indexOf(name) > -1) {
      out.push("/>");
    } else {
      out.push("></", name, ">");
    }
    if (ownLine) out.push("\n");
    return out.join("");
  });

  injection.attrs = function(d) {
    if (!arguments.length) return attrs;
    attrs = d;
    return injection;
  };

  injection.attr = function(key, val) {
    if (arguments.length === 2) {
      attrs[key] = val;
    } else if (arguments.length === 1) {
      return attrs[key];
    } else {
      throw new Error("Invalid # of arguments (" + arguments.length + ")");
    }
    return injection;
  };

  injection.content = function(d) {
    if (!arguments.length) return content;
    content = d;
    closed = false;
    return injection;
  };

  injection.closed = function(d) {
    if (!arguments.length) return closed;
    closed = d;
    return injection;
  };

  if (typeof _attrs === "object") {
    injection.attrs(_attrs);
  }
  return injection;
};

syringe.injection.script = function(url) {
  return syringe.injection.element("script")
    .before("</head>")
    .attrs({src: url});
};

syringe.injection.style = function(url, el) {
  var injection,
      media;
  switch (el) {
    case "style":
      // TODO: escape URL
      injection = syringe.injection.element("style")
        .content("@import url('" + url + "');");
      break;
    default:
      injection = syringe.injection.element("link")
        .attrs({
          rel: "stylesheet",
          href: url
        });
      break;
  }

  injection.media = function(type) {
    if (!arguments.length) return media;
    injection.attr("media", media = type);
    return injection;
  };

  return injection
    .before("</head>");
};

syringe.injection.routes = function(routes) {
  var ops = [],
      specific = [],
      fallback;
  for (var path in routes) {
    if (path === "(fallback)") {
      fallback = syringe.injection(routes[path]);
    } else {
      var op = syringe.injection(routes[path]); 
      if (!op) continue;

      console.log("created op for path:", op, path);
      if (path && path !== "*") {
        if (typeof op.path === "function") op.path(path);
        specific.push(op);
      } else {
        ops.push(op);
      }
    }
  }

  function route(body, req) {
    ops.forEach(function(op) {
      body = op(body, req);
    });
    if (specific.length) {
      var matched = false;
      specific.forEach(function(op) {
        if (!op.validate || op.validate(req)) {
          body = op(body, req);
          matched = true;
        }
      });
      if (!matched && fallback) {
        body = fallback(body, req);
      }
    }
    return body;
  }

  return syringe.injection(route);
};
*/
