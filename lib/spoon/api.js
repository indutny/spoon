var api = exports,
    spoon = require('../spoon');

api.construct = function construct(ast) {
  var cfg = spoon.cfg.create();

  cfg.translate(ast);

  return cfg;
};

api.render = function render(cfg) {
  var r = spoon.renderer.create(cfg);

  return r.render();
};
