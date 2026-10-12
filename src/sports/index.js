'use strict';
const registry=require('./registry');
registry.register(require('./hockey').hockey);
registry.register(require('./soccer').soccer);
module.exports=registry;