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

api.preprocess = function preprocess(code, options, callback) {
  if (!options) options = {};

  var ast = esprima.parse(code, options.esprima),
      cfg = api.spoon.construct(ast);

  if (callback) callback(cfg);

  ast = api.spoon.render(cfg);

  return uglify.uglify.gen_code(ast, options.uglify);
};

api.spoon = function spoon(code, fn, options) {
  if (!options) options = {};

  return api.preprocess(code, options, function(cfg) {
    cfg.asyncify(esprima.parse(fn, options.esprima), options.level);
  });
};
