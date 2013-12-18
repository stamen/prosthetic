var operation = module.exports = function(op) {
  // console.log("operation(", op, ")", typeof op);

  var params;
  switch (typeof op) {
    case "function":
      // treat functions as-is
      break;

    case "string":
      // strings just get inserted
      op = operation.insert(op);
      break;

    case "object":
      // because (typeof null === "object")
      if (op === null) {

        return null;

      } else if (Array.isArray(op)) {

        op = operation.list(op);

      } else {

        // shorthand operation support
        if (!op.type) {
          // {script: "url"}
          if (op.script) {
            op.type = "script";
            op.url = op.script;
          // {style: "url"}
          } else if (op.style) {
            op.type = "style";
            op.url = op.style;
          // {html: "url"}
          } else if (op.html) {
            op.type = "html";
            op.name = op.html;
          // {map: routes}
          } else if (op.map) {
            op.type = "map";
            op.urls = op.map;
          // {list: [ops]}
          } else if (op.list) {
            op.type = "list";
          // {text: "text"}
          } else if (op.text) {
            op.type = "text";
          }
        }

        // the operation object is the set parameters
        params = op;

        switch (op.type) {

          case "script":
            op = operation.insert.script(op.url);
            break;

          case "style":
            op = operation.insert.style(op.url, op.element);
            break;

          case "html":
            op = operation.insert.html(op.name);
            break;

          case "replace":
            op = operation.replace(op.input, op.output);
            break;

          case "remove":
            op = operation.remove(op.text);
            break;

          case "file":
            op = operation.insert.file(op.filename);
            break;

          case "debug":
            op = operation.debug(op.message);
            break;

          case "map":
            op = operation.map(op.urls || op);
            break;

          case "list":
            op = operation.list(op.list);
            break;

          case "text":
            op = operation.insert.text(op.text);
            break;

          default:
            console.warn("unrecognized op type; assuming it's a map:", Object.keys(op));
            op = operation.map(op);
        }
      }

      break;

    case "undefined":
      return null;
  }

  if (!op) return null;

  // console.log("wrapped(", op, ")");
  var wrapped = operation.wrapped(op);
  if (params) {
    apply(params, wrapped);
  }
  return wrapped;
};

/*
 * wrapped operations have the following methods:
 *
 * path([pattern])
 *    get/set the required path for this op
 * headers([headers])
 *    get/set the required headers for this op
 * query([query])
 *    get/set the required query string values for this op
 * valid(req)
 *    returns true if this op is valid for the given request
 */
operation.wrapped = function(op) {
  var valid = functor(true),
      path,
      headers,
      query;

  function wrapped(body, req) {
    if (!body || !valid(req)) {
      // if (body) console.warn("[not valid for:", req.path, "]");
      return body;
    }
    return op.apply(this, arguments);
  }

  wrapped.path = function(str) {
    if (!arguments.length) return path;
    path = str;
    if (path && path !== "*") {
      valid = and(valid, operation.validate.path(path));
    }
    return wrapped;
  };

  wrapped.headers = function(head) {
    if (!arguments.length) return headers;
    headers = head;
    valid = and(valid, operation.validate.headers(head));
    return wrapped;
  };

  wrapped.query = function(data) {
    if (!arguments.length) return query;
    query = data;
    valid = and(valid, operation.validate.query(data));
    return wrapped;
  };

  Object.keys(op).forEach(function(key) {
    // console.log("+wrapped[" + key + "]");
    wrapped[key] = op[key];
  });

  return wrapped;
};

// insertion
operation.insert = require("./insert");

// validation
operation.validate = require("./validate");

operation.replace = function(input, output) {
  var re = true,
      flags = "g";

  function replace(body) {
    if (!body || !body.length) return body;
    if (Array.isArray(input)) {
      input.forEach(function(_input) {
        body = _replace(body, _input);
      });
      return body;
    } else {
      return _replace(body, input);
    }
  }

  function _replace(body, _input) {
    var pattern = re
      ? new RegExp(_input, flags)
      : _input;
    return body.replace(pattern, output);
  }

  replace.re = function(bool) {
    if (!arguments.length) return re;
    re = !!bool;
    return replace;
  };

  replace.flags = function(f) {
    if (!arguments.length) return flags;
    flags = f;
    return replace;
  };

  return replace;
};

operation.remove = function(input) {
  return operation.replace(input, "");
};

operation.list = function(list) {
  var ops = list.map(operation)
        .filter(function(op) { return op; }),
      len = ops.length;
  if (len === 0) {
    console.warn("no ops found in:", list);
    return null;
  }
  return function(body, req) {
    for (var i = 0; i < len; i++) {
      body = ops[i].call(null, body, req);
    }
    return body;
  };
};

operation.map = function(routes) {
  var ops = [];
  for (var path in routes) {
    var op = operation(routes[path]);
    if (op) {
      ops.push(op.path(path));
    }
  }
  return operation.list(ops);
};

operation.debug = function(message) {
  var method = "info",
      reqFields = ["url"];

  function debug(body, req) {
    if (reqFields) {
      var data = {};
      reqFields.forEach(function(field) {
        data[field] = req[field];
      });
      console[method].call(console, message, data);
    } else {
      console[method].call(console, message);
    }
    return body;
  }

  debug.fields = function(fields) {
    if (!arguments.length) return reqFields;
    reqFields = fields;
    return debug;
  };

  debug.method = function(name) {
    if (!arguments.length) return method;
    method = name;
    if (!console[method]) {
      throw new Error("No such console method: " + method);
    }
    return debug;
  };

  return debug;
};

function or() {
  var tests = [].slice.call(arguments),
      len = tests.length;
  return function() {
    for (var i = 0; i < len; i++) {
      if (tests[i].apply(this, arguments)) return true;
    }
    return false;
  };
}

function and() {
  var tests = [].slice.call(arguments),
      len = tests.length;
  return function() {
    for (var i = 0; i < len; i++) {
      if (!tests[i].apply(this, arguments)) return false;
    }
    return true;
  };
}

function functor(d) {
  return function() { return d; };
}

function identity(d) {
  return d;
}

function apply(params, target, ignoreKeys) {
  var applied = [];
  for (var key in params) {
    if (ignoreKeys && ignoreKeys.indexOf[key] > -1) {
      continue;
    } else if (typeof target[key] === "function") {
      target[key].call(target, params[key]);
      applied.push(key);
    }
  }
  return applied;
}
