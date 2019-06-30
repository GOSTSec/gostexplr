var models = require('../models');
var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/:hash', async function(req, res, next) {
  const hash = encodeURI(req.params.hash);
  const blockInstance = await models.Block.findOne({
    where: {
      hash,
    },
    include: {
      model: models.Transaction,
    },
  });

  if (blockInstance === null) {
    res.status(404).render('404');
    return;
  }

  const lastBlock = await models.Block.findOne({
    attributes: [
      [models.sequelize.fn('MAX', models.sequelize.col('height')), 'maxheight']
    ],
    raw: true,
  });
  const block = blockInstance.toJSON();
  block.confirmations = lastBlock.maxheight - block.height + 1;
  block.time = block.time.toUTCString();
  block.difficulty = parseFloat(block.difficulty).toFixed(8);
  block.hashrate = block.hashrate.toLocaleString() + " H/s";
  res.render('block', {
    block,
  });

});

module.exports = router;
