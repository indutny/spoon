var cfg = exports,
    assert = require('assert'),
    spoon = require('../spoon');

function Cfg() {
  this.instructionId = 0;
  this.blockId = 0;

  this.root = null;
  this.exits = null;
  this.blocks = [];
  this.roots = [];
  this.rootQueue = [];
  this.current = null;

  this.breakInfo = null;
};
cfg.Cfg = Cfg;
cfg.create = function create() {
  return new Cfg();
};

Cfg.prototype.toString = function toString() {
  var buff = '--- CFG ---\n';

  this.blocks.forEach(function(block) {
    buff += block.toString() + '\n';
  });

  return buff;
};

Cfg.prototype.createBlock = function createBlock() {
  var block = spoon.block.create(this);

  this.blocks.push(block);

  return block;
};

Cfg.prototype.setCurrentBlock = function setCurrentBlock(block) {
  this.current = block;
};

Cfg.prototype.add = function add(type, args) {
  return this.current.add(type, args);
};

Cfg.prototype.translate = function translate(ast) {
  this.rootQueue.push({
    instr: null,
    ast: ast,
  });

  while (this.rootQueue.length > 0) {
    var root = this.rootQueue.shift(),
        block = this.createBlock();

    if (!this.root) this.root = block;

    this.exits = block.exits = [];

    this.roots.push(block);
    this.setCurrentBlock(block);
    if (root.instr) root.instr.addArg(block);
    block.root = root;

    this.visit(root.ast);

    if (this.exits.indexOf(this.current) === -1) this.exits.push(this.current);
  }

  // For each root derive control dependencies
  this.roots.forEach(function(root) {
    var leafs = this.deriveCDominator(root);
    this.deriveCFrontier(root, leafs);
  }, this);
};

Cfg.prototype.visit = function visit(ast) {
  var t = ast.type;

  if (t === 'Program' || t === 'BlockStatement') {
    return this.visitBlock(ast);
  } else if (t === 'ExpressionStatement') {
    return this.visitExpr(ast);
  } else if (t === 'CallExpression') {
    return this.visitCall(ast);
  } else if (t === 'VariableDeclaration') {
    return this.visitVar(ast);
  } else if (t === 'AssignmentExpression') {
    return this.visitAssign(ast);
  } else if (t === 'BinaryExpression') {
    return this.visitBinop(ast);
  } else if (t === 'UnaryExpression') {
    return this.visitUnop(ast);
  } else if (t === 'UpdateExpression') {
    return this.visitUnop(ast);
  } else if (t === 'Literal') {
    return this.visitLiteral(ast);
  } else if (t === 'Identifier') {
    return this.visitIdentifier(ast);
  } else if (t === 'MemberExpression') {
    return this.visitMember(ast);
  } else if (t === 'IfStatement') {
    return this.visitIf(ast);
  } else if (t === 'FunctionExpression') {
    return this.visitFunction(ast);
  } else if (t === 'FunctionDeclaration') {
    return this.visitFunction(ast);
  } else if (t === 'ReturnStatement') {
    return this.visitReturn(ast);
  } else if (t === 'WhileStatement') {
    return this.visitWhile(ast);
  } else if (t === 'DoWhileStatement') {
    return this.visitDoWhile(ast);
  } else if (t === 'BreakStatement') {
    return this.visitBreak(ast);
  } else if (t === 'ContinueStatement') {
    return this.visitContinue(ast);
  } else {
    throw new Error('Type: ' + t + ' is not supported yet!');
  }
};

Cfg.prototype.visitBlock = function visitBlock(ast) {
  // Visit each statement
  ast.body.forEach(function(instr) {
    this.visit(instr);
  }, this);

  return null;
};

Cfg.prototype.visitExpr = function visitExpr(ast) {
  return this.visit(ast.expression);
};

Cfg.prototype.visitCall = function visitCall(ast) {
  return this.add('call', [
    this.visit(ast.callee)
  ].concat(ast.arguments.map(function(arg) {
    return this.visit(arg);
  }, this)));
};

Cfg.prototype.visitVar = function visitVar(ast) {
  // Add variables
  this.add('var', ast.declarations.map(function(ast) {
    return ast.id.name;
  }, this));

  // Put values into them
  ast.declarations.forEach(function(ast) {
    if (!ast.init) return;

    this.visit({
      type: 'AssignmentExpression',
      operator: '=',
      left: ast.id,
      right: ast.init
    });
  }, this);

  return null;
};

Cfg.prototype.visitAssign = function visitAssign(ast) {
  if (ast.left.type === 'Identifier') {
    return this.add('set', [ast.left.name, this.visit(ast.right)]);
  } else if (ast.left.type === 'MemberExpression') {
    return this.add('setprop', [this.visit(ast.left.object),
                                this.visit(ast.left.property),
                                this.visit(ast.right)]);
  } else {
    throw new Error('Incorrect lhs of assignment');
  }
};

Cfg.prototype.visitBinop = function visitBinop(ast) {
  return this.add('binop', [ast.operator,
                            this.visit(ast.left),
                            this.visit(ast.right)]);
};

Cfg.prototype.visitUnop = function visitUnop(ast) {
  return this.add('unop', [ast.operator,
                           ast.prefix,
                           this.visit(ast.argument)]);
};

Cfg.prototype.visitLiteral = function visitLiteral(ast) {
  return this.add('literal', [ast.value]);
};

Cfg.prototype.visitIdentifier = function visitIdentifier(ast) {
  return this.add('get', [ast.name]);
};

Cfg.prototype.visitMember = function visitMember(ast) {
  if (!ast.computed) {
    return this.add('getprop', [this.visit(ast.object),
                                this.visit({
                                  type: 'Literal',
                                  value: ast.property.name
                                })]);
  } else {
    return this.add('getprop', [this.visit(ast.object),
                                this.visit(ast.property)]);
  }
};

Cfg.prototype.visitIf = function visitIf(ast) {
  var tblock = this.createBlock(),
      fblock = ast.alternate && this.createBlock(),
      join = this.createBlock();

  var instr = this.add('if', fblock ? [this.visit(ast.test), tblock, fblock] :
                                      [this.visit(ast.test), tblock]);

  this.current.addSuccessor(tblock);
  this.current.addSuccessor(ast.alternate ? fblock : join);
  this.current.end();

  // True branch
  this.setCurrentBlock(tblock);
  this.visit(ast.consequent);
  this.current.goto(join);

  if (fblock) {
    // False branch
    this.setCurrentBlock(fblock);
    this.visit(ast.alternate);
    this.current.goto(join);
  }

  this.setCurrentBlock(join);

  return null;
};

Cfg.prototype.visitFunction = function visitFunction(ast) {
  var instr = this.add('fn');
  instr.ast = ast;

  this.rootQueue.push({
    instr: instr,
    ast: ast.body
  });

  return instr;
};

Cfg.prototype.visitReturn = function visitReturn(ast) {
  this.add('return', ast.argument ? [this.visit(ast.argument)] : []);
  this.current.end();
  this.exits.push(this.current);

  return null;
};

Cfg.prototype.visitBreak = function visitBreak(ast) {
  var block = this.createBlock();

  this.add('break');
  this.current.addSuccessor(block);
  this.current.end();

  this.breakInfo.breakBlocks.push(block);
  return null;
};

Cfg.prototype.visitContinue = function visitContinue(ast) {
  var block = this.createBlock();

  this.add('continue');
  this.current.addSuccessor(block);
  this.current.end();

  this.breakInfo.continueBlocks.push(block);
  return null;
};

Cfg.prototype.enterLoop = function enterLoop(cb) {
  var old = this.breakInfo,
      pre = this.createBlock(),
      loop = this.createBlock(),
      start = this.createBlock(),
      end = this.createBlock();

  this.breakInfo = {
    breakBlocks: [],
    continueBlocks: []
  };

  pre.loop = true;
  this.current.goto(pre);
  pre.goto(start);
  this.setCurrentBlock(start);

  var result = cb.call(this, end, loop);

  // Add continue blocks before looping block
  this.breakInfo.continueBlocks.concat(loop).reduce(function(p, b) {
    return p.goto(b);
  }, this.current);

  // Looping block goes to the start of loop
  loop.goto(pre);

  // Add break blocks after end
  var lastBrk = this.breakInfo.breakBlocks.reduce(function(p, b) {
    return p.goto(b);
  }, end);

  // Add one last block that will have only one parent
  this.setCurrentBlock(lastBrk.goto(this.createBlock()));

  // Restore
  this.breakInfo = old;

  return null;
};

Cfg.prototype.visitWhile = function visitContinue(ast) {
  return this.enterLoop(function(end) {
    var start = this.current,
        body = this.createBlock();

    var instr = this.add('while', [this.visit(ast.test)]);

    start.addSuccessor(body);
    start.addSuccessor(end);
    start.end();

    this.setCurrentBlock(body);
    this.visit(ast.body);
  });
};

Cfg.prototype.visitDoWhile = function visitContinue(ast) {
  return this.enterLoop(function(end) {
    var pre = this.createBlock(),
        extra = this.createBlock();

    this.breakInfo.breakBlocks.push(extra);

    var instr = this.add('do');

    this.current.addSuccessor(pre);
    this.current.addSuccessor(extra);
    this.current.end();

    this.setCurrentBlock(pre);
    this.visit(ast.body);

    var cond = this.createBlock(),
        next = this.createBlock();
    this.current.goto(cond);

    this.setCurrentBlock(cond);
    instr.test = this.visit(ast.test);
    this.add('doend');
    this.current.addSuccessor(next);
    this.current.addSuccessor(end);
    this.current.end();

    this.setCurrentBlock(next);
  });
};

// Derive control dominanator tree
Cfg.prototype.deriveCDominator = function deriveCDominator(root) {
  var nodes = [],
      visited = {},
      queue = [root];

  // Get list of all nodes first
  while (queue.length > 0) {
    var node = queue.pop();
    if (visited[node.id]) continue;
    visited[node.id] = true;
    nodes.push(node);

    node.successors.forEach(function(succ) {
      queue.push(succ);
    });
  }

  // At start each node (except exits) will think it has all nodes as children
  nodes.forEach(function(node) {
    node.cparents = nodes.slice();
  });

  // But exits do not have children
  root.exits.forEach(function(node) {
    node.cparents = [ node ];
  });

  // Propagate set intersection until there will be no changes
  var changed;
  do {
    changed = false;

    nodes.forEach(function(node) {
      var parents = [ node ],
          seen = {};

      node.successors.forEach(function(succ) {
        succ.cparents.forEach(function(parent) {
          seen[parent.id] = (seen[parent.id] || 0) + 1;
          if (seen[parent.id] === node.successors.length && parent !== node) {
            parents.push(parent);
          }
        });
      });

      if (node.cparents.length !== parents.length) {
        changed = true;
        node.cparents = parents;
      }
    });
  } while (changed);

  // Leave only closest on the route from exit to node (immediate) parents
  nodes.forEach(function(node) {
    var closest = node.cparents.filter(function(parent) {
      return parent !== node;
    }).map(function(parent) {
      return {
        parent: parent,
        distance: parent.distance(node)
      };
    }).sort(function(a, b) {
      return a.distance - b.distance;
    })[0];

    if (closest) {
      node.cparent = closest.parent;
      node.cparent.cchildren.push(node);
    } else {
      node.cparent = null;
      return;
    }
  });

  // Return "leafs" (needed for bottom-up traversal later)
  return nodes.filter(function(node) {
    return node.cchildren.length === 0;
  });
};

// Derive dominance frontier of reverse CFG
Cfg.prototype.deriveCFrontier = function deriveCFrontier(root, leafs) {
  var rdf = {},
      visited = {},
      queue = leafs.slice();

  // Bottom-up traversal of reverse dominator tree
  while (queue.length > 0) {
    var node = queue.shift();

    // Skip already visited nodes
    if (visited[node.id]) continue;

    // Every child should be visited before this node
    var reachable = node.cchildren.every(function(child) {
      return visited[child.id];
    });
    if (!reachable) continue;

    visited[node.id] = true;

    if (!rdf[node.id]) rdf[node.id] = { node: node, map: {} };
    var r = rdf[node.id].map;

    // Local
    node.predecessors.forEach(function(pred) {
      if (pred.cparent === node) return;
      r[pred.id] = pred;
    });

    // Up
    node.cchildren.forEach(function(child) {
      if (!rdf[child.id]) rdf[child.id] = { node: child, map: {} };
      var cr = rdf[child.id].map;

      Object.keys(cr).forEach(function(id) {
        if (cr[id].cparent === node) return;
        r[id] = cr[id];
      });
    });

    // Now visit parent
    if (node.cparent) queue.push(node.cparent);
  }

  Object.keys(rdf).forEach(function(id) {
    // Set sorted by distance frontier
    rdf[id].node.cfrontier = Object.keys(rdf[id].map).map(function(sid) {
      return rdf[id].map[sid];
    });
  });
};
