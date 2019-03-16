var http = require('http');
const fs = require('fs-ext');
const moment = require('moment');

var models = require('../models');
var rpcConfig = require('../config/config')['rpc'];

const {username, password, hostname, port} = rpcConfig;

let sync_sql = '',
    coolstrs = [];

function MakeRPCRequest(postData) {
  return new Promise(function(resolve, reject) {
    var post_options = {
      host: hostname,
      port: port,
      auth: `${username}:${password}`,
      path: '/',
      method: 'POST',
      headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
      }
    };

    var post_req = http.request(post_options, function(res) {
      res.setEncoding("utf8");
      let body = "";
      res.on("data", data => {
        body += data;
      });
      res.on("end", () => {
        resolve(body);
      });
    });

    post_req.on('error', function(err) {
        if (err.code == 'ECONNREFUSED') {
          console.log('\x1b[36m%s\x1b[0m', "Couldn't make request to wallet")
        }
        reject(err);
    });

    post_req.write(postData);
    post_req.end();
  });
}

async function saveTransaction(txid, blockHeight) {
  const res_tx = await MakeRPCRequest(JSON.stringify({
    method: 'getrawtransaction',
    params: [txid, 1],
    id: 1
  }));

  const tx = JSON.parse(res_tx)['result'];
  if (tx === null) {
    await models.Failure.create({
      msg: `${txid} fetching failed`,
    });
    return;
  }

  // const transaction = await models.Transaction.create({
  //   txid: tx.txid,
  //   BlockHeight: blockHeight,
  // });
  sync_sql += `
    INSERT INTO Transactions (
      txid,
      BlockHeight
    )
    VALUES (
      "${txid}",
      ${blockHeight}
    );
    SET @txid = LAST_INSERT_ID();
  `;

  // Loop over vouts
  for (var i = 0; i < tx.vout.length; i++) {
    const vout = tx.vout[i];

    // const m_vout = await models.Vout.create({
    //   n: vout.n,
    //   value: vout.value,
    // });
    sync_sql += `
      INSERT INTO Vouts (n, value)
      VALUES ("${vout.n}", "${vout.value}");
      SET @voutid= LAST_INSERT_ID();
    `;

    // Loop over addresses in vout
    for (var y = 0; y < vout.scriptPubKey.addresses.length; y++) {
      const address = vout.scriptPubKey.addresses[y];
      // let m_address = await models.Address.findOne({
      //   where: {
      //     address,
      //   },
      // });
      // if (m_address === null) {
      //   m_address = await models.Address.create({
      //     address,
      //   });
      // }
      sync_sql += `
        INSERT IGNORE INTO Addresses (address) VALUES ("${address}");
        SET @addrid = (
          SELECT IF(
            ROW_COUNT() > 0,
            LAST_INSERT_ID(),
            (
              SELECT id
              FROM Addresses
              WHERE address='${address}'
            )
          )
        );
      `;
      // await m_vout.addAddresses(m_address);
      sync_sql += `
        INSERT INTO AddressVouts (AddressId, VoutId)
        VALUES (@addrid, @voutid);
      `;
    }
    // await transaction.addVouts(m_vout, {through: {direction: 1}});
    sync_sql += `
      INSERT INTO TransactionVouts (TransactionId, VoutId, direction)
      VALUES (@txid, @voutid, 1);
    `;
  }

  // Loop over vins
  for (var i = 0; i < tx.vin.length; i++) {
    const vin = tx.vin[i];
    if (vin.txid) {
      // const vout = await models.Vout.findAll({
      //   include: {
      //     model: models.Transaction,
      //     where: {
      //       txid: vin.txid,
      //     },
      //   },
      //   where: {
      //     n: vin.vout,
      //   },
      // });
      // if (vout) {
      //   await transaction.addVouts(vout[0], { through: { direction: 0, }, });
      // } else {
      //   throw('Couldnt find vout for VIN');
      // }
      sync_sql += `
        SET @vin = (
          SELECT Vouts.id
          FROM Vouts
          INNER JOIN TransactionVouts
          ON Vouts.id=TransactionVouts.VoutId
          INNER JOIN Transactions
          ON Transactions.id=TransactionVouts.TransactionId
          WHERE
            TransactionVouts.direction=1 AND
            Transactions.txid="${vin.txid}" AND
            Vouts.n=${vin.vout}
        );
        INSERT INTO TransactionVouts (TransactionId, VoutId, direction)
        VALUES (@txid, @vin, 0);
      `
    }
  }
}

async function syncNextBlock(syncedHeight) {
  const height = syncedHeight + 1;
  sync_sql = '';

  const res_hash = await MakeRPCRequest(JSON.stringify({
    method: 'getblockhash',
    params: [height],
    id: 1
  }));
  const blockHash = JSON.parse(res_hash)['result'];
  const res_block = await MakeRPCRequest(JSON.stringify({
    method: 'getblock',
    params: [blockHash],
    id: 1
  }));
  const block = JSON.parse(res_block)['result'];

  block.time = moment(block.time*1000).format('YYYY-MM-DD HH:mm:ss');

  // await models.Block.create(block);
  sync_sql = `
    SET autocommit = 0;
    START TRANSACTION;
    INSERT INTO Block (
      hash,
      height,
      size,
      version,
      merkleroot,
      time,
      nonce,
      bits,
      difficulty,
      previousblockhash,
      nextblockhash
    )
    VALUES (
      "${block.hash}",
      "${block.height}",
      "${block.size}",
      "${block.version}",
      "${block.merkleroot}",
      "${block.time}",
      "${block.nonce}",
      "${block.bits}",
      "${block.difficulty}",
      "${block.previousblockhash}",
      "${block.nextblockhash}"
    );
    `
  coolstrs = []
  for (var i = 0; i < block.tx.length; i++) {
    await saveTransaction(block.tx[i], block.height);
    coolstrs.push(`${block.tx[i]} - ${block.time}`);
  }


  if (block.height > 1) {
    // await models.Block.update({
    //   nextblockhash: block.hash
    // },{
    //   where: {
    //     hash: block.previousblockhash
    //   }
    // });
    sync_sql += `
      UPDATE Block
      SET nextblockhash="${block.previousblockhash}"
      WHERE nextblockhash="${block.previousblockhash}";
    `
  }
  sync_sql += 'COMMIT;'
  await models.sequelize.query(sync_sql);

  return height;
}

async function getCurrentHeight() {
  const result = await MakeRPCRequest(JSON.stringify({
    method: 'getblockcount',
    params: [],
    id: 1
  }));
  return JSON.parse(result)['result'];
}

async function getSyncedHeight() {
  const result = await models.Block.findOne({
    attributes: ['height'],
    order: [['height', 'DESC']],
    limit: 1
  });

  const height = result ? result.height : -1;
  return height;
}

async function acquireLock() {
  let fd = fs.openSync('sync.lock', 'w');
  try {
    fs.flockSync(fd, 'exnb');
  } catch(ex) {
    if (ex.code === 'EAGAIN') {
      console.log('Synchronization is already running');
    } else {
      console.log('Could\'nt lock file', ex);
    }
    throw ex;
  }
}

async function syncBlockchain() {

  try {

    await acquireLock();

    let syncedHeight = await getSyncedHeight();
    console.log('\x1b[36m%s\x1b[0m', 'syncedHeight is', syncedHeight);

    let currentHeight = await getCurrentHeight();
    console.log('\x1b[36m%s\x1b[0m', 'currentHeight is', currentHeight);

    while (syncedHeight < currentHeight) {
      syncedHeight = await syncNextBlock(syncedHeight);
      if (coolstrs) {
        for(str of coolstrs) {
          console.log('\x1b[36m%s\x1b[0m', 'syncedHeight: ', syncedHeight, str)
        }
      } else {
        console.log('\x1b[36m%s\x1b[0m', 'syncedHeight: ', syncedHeight)
      }
    }
  } catch (e) {
    console.log(e);
  } finally {
    models.sequelize.close().then(() => process.exit(0));
  }
}

syncBlockchain();
