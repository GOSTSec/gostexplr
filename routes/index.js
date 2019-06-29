var models = require('../models');
var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', async function(req, res, next) {

  const blocks = await models.Block.findAll({
    attributes: ['height', 'hash', 'time', 'difficulty', 'hashrate'],
    order: [['height', 'DESC']],
    limit: 50,
  });
  blocks.forEach(function(arrayItem) {
    arrayItem.ago = arrayItem.time.toUTCString().substring(5);
    arrayItem.difficulty = arrayItem.difficulty.toFixed(8);
  });
  res.render('index', {
    blocks,
  });
});

module.exports = router;
