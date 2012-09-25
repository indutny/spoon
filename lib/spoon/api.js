var api = exports,
    esprima = require('esprima'),
    uglify = require('uglify-js');

api.construct = function construct(ast) {
  var cfg = api.spoon.cfg.create();

  cfg.translate(ast);

  return cfg;
};

api.render = function render(cfg) {
  var r = api.spoon.renderer.create(cfg);

  return r.render();
};

api.spoon = function spoon(code, fn, options) {
  if (!options) options = {};

  var ast = esprima.parse('function main() {\n' +
                          code +
                          '\n}',
                          options.esprima),
      cfg = spoon.construct(ast);

  cfg.asyncify(fn);
  ast = spoon.render(cfg);

  // Leave only function's body
  ast[1] = ast[1][0][1][3];

  return uglify.uglify.gen_code(ast, options.uglify);
};
