var operation = module.exports = function(op) {
  // console.log("operation(", op, ")", typeof op);

  switch (typeof op) {
    case "function":
      break;

    case "string":
      op = operation.insert(op);
      break;

    case "object":
      if (op === null) {
        return null;
      } else if (Array.isArray(op)) {

        op = operation.list(op);

      } else {

        var params = op;
        switch (op.type) {

          case "script":
            op = operation.insert.script(op.url);
            apply(params, op, ["url"]);
            break;

          case "style":
            op = operation.insert.style(op.url, op.element);
            apply(params, op, ["element", "url"]);
            break;

          case "html":
            op = operation.insert.html(op.name);
            apply(params, op, ["name"]);
            break;

          case "replace":
            op = operation.replace(op.input, op.output);
            apply(params, op, ["input", "output"]);
            break;

          default:
            op = operation.map(op);
            break;
        }
      }

      break;

    case "undefined":
      return null;
  }

  // console.log("wrapped(", op, ")");
  return operation.wrapped(op);
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
      if (body) console.warn("[not valid for:", req.path, "]");
      return body;
    }
    return op.apply(this, arguments);
  }

  wrapped.path = function(str) {
    if (!arguments.length) return path;
    path = str;
    valid = and(valid, operation.validate.path(path));
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
  function replace(body) {
    if (!body || !body.length) return body;
    return body.replace(input, output);
  }
  return replace;
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
