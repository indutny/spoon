var renderer = exports,
    assert = require('assert'),
    spoon = require('../spoon');

function Renderer(cfg) {
  this.current = null;
  this.cfg = cfg;

  // Queue of blocks to visit
  this.queue = null;
  this.slots = null;
  this.defaultSlots = null;

  // Track block visits to perfrom preorder traversal
  this.blockVisits = {};

  // Cache
  this.blocks = {};
  this.instructions = {};
};
renderer.Renderer = Renderer;
renderer.create = function create(cfg) {
  return new Renderer(cfg);
};

Renderer.prototype.addSlots = function addSlot(slots) {
  this.slots[this.current.id] = slots.map(function(slot, i) {
    assert(this.current.successors[i] !== undefined);
    return [ this.current.successors[i], slot ];
  }, this);
};

Renderer.prototype.getSlot = function getSlot() {
  var slots = this.current.cfrontier[0] &&
              this.slots[this.current.cfrontier[0].id];
  if (!slots) return this.defaultSlots[0];

  // One branch - one slot
  if (slots.length === 1) return slots[0][1];

  // Choose closest branch
  if (this.current.distance(slots[0][0]) < this.current.distance(slots[1][0])) {
    return slots[0][1];
  } else {
    return slots[1][1];
  }
};

Renderer.prototype.canVisit = function canVisit(block, update) {
  var r;

  if (update !== false) {
    if (!this.blockVisits[block.id]) {
      r = this.blockVisits[block.id] = 1;
    } else {
      r = ++this.blockVisits[block.id];
    }
  } else {
    r = this.blockVisits[block.id] || 0;
  }

  return block.loop ?
      r == (update === false ? 0 : 1)
      :
      r >= block.predecessors.length;
};

Renderer.prototype.render = function render() {
  var result = ['toplevel', []];

  this.queue = [ this.cfg.root ];
  this.slots = {};
  this.defaultSlots = [ null, result[1] ];

  while (this.queue.length > 0) {
    var current = this.queue.pop();
    this.current = current;
    if (this.current.predecessors.length === 0) {
      this.defaultSlots.shift();
    }

    var slot = this.getSlot();

    // Visit only if all parents were processed
    if (!this.canVisit(current)) continue;

    this.renderBlock(current).forEach(function(instr) {
      slot.push(['stat', instr]);
    });

    // Enqueue blocks with priority to left one
    current.successors.slice().reverse().forEach(function(block) {
      this.queue.push(block);
    }, this);
  }

  return result;
};

Renderer.prototype.renderBlock = function renderBlock(block) {
  var ast = [];

  // Visit instructions in reverse order to detect dependencies
  block.instructions.slice().reverse().forEach(function(instr) {
    // If instruction was already rendered - skip it
    if (this.instructions[instr.id]) return;

    this.currentInstruction = instr;

    var instr = this.renderInstruction(instr);
    if (instr) ast.push(instr);
  }, this);

  ast.reverse();
  this.blocks[block.id] = ast;

  return ast;
};

Renderer.prototype.renderInstruction = function renderInstruction(instr) {
  var name = ['name', '__$i' + instr.id];
  if (this.current !== instr.block) return name;

  // If instruction has external uses - generate it separately and put it's
  // result to the variable
  var external = instr.id > this.currentInstruction.id ||
                 instr.uses.some(function(use) {
                   return use.block !== this.current;
                 }, this);

  if (external && this.currentInstruction !== instr) return name;

  var args = instr.args.map(function(arg) {
    if (arg instanceof spoon.instruction.Instruction) {
      return this.renderInstruction(arg);
    }
    return arg;
  }, this);

  var t = instr.type,
      fn;

  if (t === 'literal') {
    fn = this.renderLiteral;
  } else if (t === 'get') {
    fn = this.renderGet;
  } else if (t === 'set') {
    fn = this.renderSet;
  } else if (t === 'setprop') {
    fn = this.renderSetprop;
  } else if (t === 'var') {
    fn = this.renderVar;
  } else if (t === 'binop') {
    fn = this.renderBinop;
  } else if (t === 'unop') {
    fn = this.renderUnop;
  } else if (t === 'return') {
    fn = this.renderReturn;
  } else if (t === 'fn') {
    fn = this.renderFn;
  } else if (t === 'goto') {
    fn = this.renderGoto;
  } else if (t === 'call') {
    fn = this.renderCall;
  } else if (t === 'getprop') {
    fn = this.renderGetprop;
  } else if (t === 'if') {
    fn = this.renderIf;
  } else if (t === 'logical') {
    fn = this.renderIf;
  } else if (t === 'while') {
    fn = this.renderWhile;
  } else if (t === 'do') {
    fn = this.renderDo;
  } else if (t === 'doend') {
    fn = this.renderDoEnd;
  } else if (t === 'forin') {
    fn = this.renderForIn;
  } else if (t === 'break') {
    fn = this.renderBreak;
  } else if (t === 'continue') {
    fn = this.renderContinue;
  } else if (t === 'phi') {
    fn = this.renderPhi;
  } else if (t === 'phimove') {
    fn = this.renderPhiMove;
  } else if (t === 'ternary') {
    fn = this.renderIf;
  } else if (t === 'object') {
    fn = this.renderObject;
  } else if (t === 'array') {
    fn = this.renderArray;
  } else {
    throw new Error('Unexpected instruction: ' + t);
  }

  var ast = fn.call(this, args, instr);
  this.instructions[instr.id] = ast;

  // Wrap instructions with external use into variable declaration
  if (external) ast = ['var', [[name[1], ast]]];
  return ast;
};

Renderer.prototype.renderLiteral = function renderLiteral(args) {
  if (typeof args[0] === 'string') {
    return ['string', args[0]];
  } else {
    return ['num', args[0]];
  }
};

Renderer.prototype.renderGet = function renderGet(args) {
  return ['name', args[0]];
};

Renderer.prototype.renderSet = function renderSet(args) {
  return ['assign', args[0] === '=' ? true : args[0].replace(/=/g, ''),
          ['name', args[1]], args[2]];
};

Renderer.prototype.renderSetprop = function renderSetprop(args) {
  return ['assign', args[0] === '=' ? true : args[0].replace(/=/g, ''),
          this.renderGetprop(args.slice(1, 3)), args[3]];
};

Renderer.prototype.renderVar = function renderVar(args) {
  return ['var', args.map(function(name) {
    return [name];
  })];
};

Renderer.prototype.renderBinop = function renderBinop(args) {
  return ['binary', args[0], args[1], args[2]];
};

Renderer.prototype.renderUnop = function renderUnop(args) {
  return ['unary-' + (args[1] ? 'prefix' : 'postfix'), args[0], args[2]];
};

Renderer.prototype.renderReturn = function renderReturn(args) {
  return ['return', args[0]];
};

Renderer.prototype.renderFn = function renderFn(args, instr) {
  var prefix = instr.ast.type === 'FunctionExpression' ? 'function' : 'defun',
      name = instr.ast.id && instr.ast.id.name,
      slot = [];

  var inputs = instr.ast.params.map(function(param) {
    return param.name;
  });

  this.queue.unshift(args[0]);
  this.defaultSlots.push(slot);

  return [prefix, name, inputs, slot];
};

Renderer.prototype.renderGoto = function renderGoto() {
  return null;
};

Renderer.prototype.renderCall = function renderCall(args) {
  return ['call', args[0], args.slice(1)];
};

Renderer.prototype.renderGetprop = function renderGetprop(args) {
  if (args[1][0] === 'string') return ['dot', args[0], args[1][1]];
  return ['sub', args[0], args[1]];
};

Renderer.prototype.renderIf = function renderIf(args, instr) {
  var slots = [ [], [] ],
      ast = ['if', args[0]].concat(slots.map(function(slot) {
        return ['block', slot ];
      }));

  this.addSlots(slots);

  return ast;
};

Renderer.prototype.renderWhile = function renderWhile(args, instr) {
  var slot = [];
  this.addSlots([ slot ]);
  return ['while', args[0], ['block', slot]];
};

Renderer.prototype.renderDo = function renderDo(args) {
  var slot = [];
  this.addSlots([ slot ]);
  return ['do', args[0], ['block', slot]];
};

Renderer.prototype.renderDoEnd = function renderDoEnd(args) {
  return null;
};

Renderer.prototype.renderForIn = function renderForIn(args) {
  var slot = [];
  this.addSlots([ slot ]);
  return ['for-in', args[0], args[0], args[1], ['block', slot]];
};

Renderer.prototype.renderBreak = function renderBreak(args) {
  return ['break'];
};

Renderer.prototype.renderContinue = function renderContinue(args) {
  return ['continue'];
};

Renderer.prototype.renderContinue = function renderContinue(args) {
  return ['continue'];
};

Renderer.prototype.renderPhi = function renderPhi() {
  return null;
};

Renderer.prototype.renderPhiMove = function renderPhiMove(args) {
  return ['assign', true, args[1], args[0]];
};

Renderer.prototype.renderObject = function renderObject(args) {
  var kvs = [];

  for (var i = 0; i < args.length; i += 2) {
    kvs.push([ args[i], args[i + 1] ]);
  }

  return ['object', kvs];
};

Renderer.prototype.renderArray = function renderArray(args) {
  return ['array', args];
};
