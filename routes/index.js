var models = require('../models');
var express = require('express');
var router = express.Router();
var HeightOffset = require('../config/config')['syncHeightOffset'] || 0;

function formatRate(hashrate, decimals = 2) {
    if (hashrate === 0) return '0 H/s';

    const k = 1000;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s', 'ZH/s', 'YH/s'];

    const i = Math.floor(Math.log(hashrate) / Math.log(k));

    return parseFloat((hashrate / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function shorterHash(hash) {
    var parts = hash.match(/[\s\S]{1,14}/g) || [];
    return parts[0] + '...' + parts[parts.length-1];
}

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
    arrayItem.difficulty = parseFloat(arrayItem.difficulty).toFixed(8);
    arrayItem.hashrate = formatRate(arrayItem.hashrate, 4);
    arrayItem.hash_short = shorterHash(arrayItem.hash);
  });
  res.render('index', {
    HeightOffset,
    blocks,
  });
});

module.exports = router;
