# Syringe
Syringe is a Node web proxy that allows you to manipulate web sites with simple
(yet flexible) JSON configuration files.

## Running your proxy server
To run a proxy, just run server.js with node:

```sh
$ node server.js --proxy http://example.com
```

Then visit [localhost:8001](http://localhost:8001) in your browser. Run `node
server.js --help` (or without any arguments) to see the full usage:

```
Syringe usage:

1. with a proxy URL and one or more injections:

   node ./server.js --proxy URL [injections]

2. with a JSON config and proxy URL:

   node ./server.js -c config.json --proxy URL [options] [injections]

3. with a JSON config that includes the 'proxy' option:

   node ./server.js -c config.json [options] [injections]

where [injections] is an optional list of JSON filenames
containing injection specs.

Options:
  --proxy, -p    the URL to proxy (e.g. http://example.com)       
  --rewrite, -r  whether to rewrite the proxy URL in each response
  --config, -c   the config file to load                          
  --port, -P     the port on which to listen (default: 8001)      
```

The included `config.sample.json` is a good place to start for building a
configuration.

The `ops` directory contains some examples of operations to run in your proxy.
For instance, the included [d3.json](ops/d3.json) simply adds
[d3.js](http://d3js.org) to the proxied web page, and
[reset-css.json](ops/reset-css.json) pulls in the [YUI CSS
Reset](http://yuilibrary.com/yui/docs/cssreset/).
