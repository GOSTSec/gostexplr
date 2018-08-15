var models = require('../models');
var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/:address/:offset*?', async function(req, res, next) {

  const safe_address = encodeURI(req.params.address);

  const address = await models.Address.findOne({
    where: {
      address: safe_address,
    },
    include: {
      model: models.Vout,
      include: {
        model: models.Transaction,

      },
    },
  });

  if (address === null) {
    res.status(404).render('404');
    return;
  }

  const limit = 30;
  const paramPage = parseInt(req.params.offset);
  const page = isNaN(paramPage) || paramPage < 1 ? 1 : paramPage;
  const offset = 30 * (page - 1);

  const nextpage = address.Vouts.length === 30 ? page + 1 : null;
  const prevpage = page > 1 ? page - 1 : null;

  res.render('address', {
    address: address.toJSON(),
    nextpage,
    prevpage,
  });
});

module.exports = router;
