var block = exports,
    spoon = require('../spoon');

function Block(cfg) {
  this.cfg = cfg;
  this.id = cfg.blockId++;

  // CFG
  this.successors = [];
  this.predecessors = [];

  // Dominator tree
  this.cparent = null;
  this.cparents = [];
  this.cchildren = [];
  this.cfrontier = [];

  this.instructions = [];
  this.root = null;
  this.loop = false;
  this.exits = null;

  this.ended = false;
};
block.Block = Block;
block.create = function create(cfg) {
  return new Block(cfg);
};

Block.prototype.toString = function toString() {
  var buff = '[block ' + this.id + '' + (this.loop ? ' loop' : '') + ']\n';

  buff += '# predecessors: ' + this.predecessors.map(function(b) {
    return b.id
  }).join(', ') + '\n';
  buff += '# ctrl frontier: ' + this.cfrontier.map(function(b) {
    return b.id;
  }).join(', ') + '\n';
  buff += '# ctrl parent: ' + (this.cparent && this.cparent.id) + '\n';

  this.instructions.forEach(function(instr) {
    buff += instr.toString() + '\n';
  });

  buff += '# successors: ' + this.successors.map(function(b) {
    return b.id;
  }).join(', ') + '\n';
  buff += '# ctrl children: ' + this.cchildren.map(function(b) {
    return b.id;
  }).join(', ') + '\n';

  return buff;
};

Block.prototype.add = function add(type, args) {
  var instr = spoon.instruction.create(this, type, args || []);
  if (this.ended) return instr;

  this.instructions.push(instr);
  return instr;
};

Block.prototype.end = function end() {
  this.ended = true;
};

Block.prototype.addSuccessor = function addSuccessor(block) {
  if (this.successors.length == 2) {
    throw new Error('Block can\'t have more than 2 successors');
  }
  this.successors.push(block);
  block.addPredecessor(this);
};

Block.prototype.addPredecessor = function addPredecessor(block) {
  if (this.predecessors.length == 2) {
    throw new Error('Block can\'t have more than 2 predecessors');
  }
  this.predecessors.push(block);
};

Block.prototype.goto = function goto(block) {
  if (this.ended) return block;

  this.add('goto');
  this.addSuccessor(block);
  this.end();

  // For chaining
  return block;
};
