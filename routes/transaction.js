var models = require('../models');
var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/:txid', async function(req, res, next) {
  const txid = encodeURI(req.params.txid);

  const transaction = await models.Transaction.findOne({
    where: {
      txid,
    },
    include: [{
      attributes: ['hash', 'time', 'height'],
      model: models.Block,
    },{
      model: models.Vout,
      include: [
        {
          model: models.Address,
        }, {
          model: models.Transaction,
        }
      ],
    },],
  });

  if (transaction === null) {
    res.status(404).render('404');
    return;
  }

  const lastBlock = await models.Block.findOne({
    attributes: [
      [models.sequelize.fn('MAX', models.sequelize.col('height')), 'maxheight']
    ],
    raw: true,
  });
  const confirmations = lastBlock.maxheight - transaction.Block.height + 1;

  const txJson = transaction.toJSON();
  const txTemplate = Object.assign(txJson, {
    vins: txJson.Vouts.filter((vout) => vout.TransactionVouts.direction === 0),
    vouts: txJson.Vouts.filter((vout) => vout.TransactionVouts.direction === 1),
  });

  txTemplate.blockTime = transaction.Block.time.toUTCString();

  res.render('transaction', {
    transaction: txTemplate,
    // vouts,
    confirmations,
  });
});

module.exports = router;
