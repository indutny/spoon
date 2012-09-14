var cfg = exports,
    spoon = require('../spoon');

function Cfg() {
  this.instructionId = 0;
  this.blockId = 0;

  this.root = null;
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

    this.roots.push(block);
    this.setCurrentBlock(block);
    if (root.instr) root.instr.addArg(block);
    block.root = root;

    this.visit(root.ast);
  }
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

  this.add('if', fblock ? [this.visit(ast.test), tblock, fblock] :
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
  this.add('return', [this.visit(ast.argument)]);
  this.current.end();

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
      pre = this.current,
      start = this.createBlock(),
      end = this.createBlock();

  this.breakInfo = {
    breakBlocks: [],
    continueBlocks: []
  };

  start.loop = true;
  this.setCurrentBlock(start);

  var result = cb.call(this, end);

  // Add continue blocks before loop
  var lastCont = this.breakInfo.continueBlocks.reduce(function(p, b) {
    b.loop = true;
    return p.goto(b);
  }, pre);
  lastCont.addSuccessor(start);
  lastCont.end();

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

    this.add('while', [this.visit(ast.test)]);
    start.addSuccessor(body);
    start.addSuccessor(end);
    start.end();

    this.setCurrentBlock(body);
    this.visit(ast.body);

    // Fill looping block
    if (!this.current.ended) {
      this.current.goto(start);
    }
  });
};

Cfg.prototype.visitDoWhile = function visitContinue(ast) {
  return this.enterLoop(function(end) {
    var start = this.current,
        pre = this.createBlock();

    this.add('do');
    this.current.addSuccessor(pre);
    this.current.end();
    this.setCurrentBlock(pre);
    this.visit(ast.body);

    var cond = this.createBlock();
    this.current.goto(cond);

    this.setCurrentBlock(cond);
    this.add('doend', [this.visit(ast.test)]);
    cond.addSuccessor(start);
    cond.addSuccessor(end);
    cond.end();
  });
};
