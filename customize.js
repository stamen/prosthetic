var fs = require("fs"),
    sys = require("sys"),
    argv = require("optimist").argv,
    argc = argv._,
    source = String(fs.readFileSync("syringe.js"));

if (argc.length) {
  var filename = argc[0],
      config = String(fs.readFileSync(filename)),
      result = source
        .replace(/CONFIG_FILENAME/g, filename)
        .replace("{/* CONFIG */}", indent(config, 2));
  sys.puts(result);
} else {
  source = strip(source, "// <CONFIG", "// CONFIG>");
  sys.puts(source);
}

// super hacky indentation formatter
function indent(str, depth) {
  var prefix = "";
  for (var i = 0; i < depth; i++) prefix += "  ";
  return str
    .replace(/\s+$/, "")
    .replace(/\n/g, "\n" + prefix);
}

// super hacky function that filters out lines of a string between the start
// and end markers
function strip(str, start, end) {
  if (str.indexOf(start) === -1 && str.indexOf(end) === -1) {
    return str;
  }

  var removing = false,
      lines = str.split("\n")
        .filter(function(line) {
          if (!removing && line.indexOf(start) > -1) {
            removing = true;
            return false;
          } else if (removing && line.indexOf(end) > -1) {
            return removing = false;
          }
          return !removing;
        });
  return lines.join("\n");
}
