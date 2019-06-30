var models = require('../models');
var express = require('express');
var router = express.Router();

function formatRate(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1000;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s', 'ZH/s', 'YH/s'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

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
    arrayItem.hashrate = formatRate(arrayItem.hashrate, 4);
  });
  res.render('index', {
    blocks,
  });
});

module.exports = router;
