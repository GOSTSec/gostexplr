var models = require('../models');
var express = require('express');
var router = express.Router();
var HeightOffset = require('../config/config')['syncHeightOffset'] || 0;

const BLOCKS_PER_PAGE = 50;
const PAGINATION_LIMIT = 5;

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

function getPagination(count, page) {
  const pagesCount = count > BLOCKS_PER_PAGE ? Math.ceil(count / BLOCKS_PER_PAGE) : 0;
  let pagination = null;
  if (pagesCount) {
    pagination = {
      'left': null,
      'range': [],
      'right': null,
    }

    const pagLimitHalf = Math.ceil(PAGINATION_LIMIT / 2);

    const pagRangeLeft = page - pagLimitHalf;
    if (pagRangeLeft < 3) {
      pagination.range[0] = 1;
    } else {
      pagination.left = 1;
      pagination.range[0] = pagRangeLeft;
    }

    const pagRangeRight = page + pagLimitHalf;
    if (pagRangeRight > pagesCount - 3) {
      pagination.range[1] = pagesCount;
    } else {
      pagination.right = pagesCount;
      pagination.range[1] = pagRangeRight;
    }
  }
  return pagination;
}

/* GET home page. */
router.get('/:offset*?', async function(req, res, next) {

  const paramPage = parseInt(req.params.offset);
  const page = isNaN(paramPage) || paramPage < 1 ? 1 : paramPage;
  const offset = BLOCKS_PER_PAGE * (page - 1);

  const blocks = await models.Block.findAll({
    attributes: ['height', 'hash', 'time', 'difficulty', 'hashrate'],
    order: [['height', 'DESC']],
    limit: BLOCKS_PER_PAGE,
    offset,
  });

  const count = await models.Block.count();
  const pagination = getPagination(count, page);

  blocks.forEach((arrayItem) => {
    arrayItem.ago = arrayItem.time.toUTCString().substring(5);
    arrayItem.difficulty = parseFloat(arrayItem.difficulty).toFixed(8);
    arrayItem.hashrate = formatRate(arrayItem.hashrate, 4);
    arrayItem.hash_short = shorterHash(arrayItem.hash);
  });

  res.render('index', {
    HeightOffset,
    pagination,
    blocks,
    page,
  });
});

module.exports = router;
