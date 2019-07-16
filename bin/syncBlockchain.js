var http = require('http');
const fs = require('fs-ext');
const moment = require('moment');

var models = require('../models');
var rpcConfig = require('../config/config')['rpc'];
var HeightOffset = require('../config/config')['syncHeightOffset'] || 0;

const {username, password, hostname, port} = rpcConfig;

const keepAliveAgent = new http.Agent({ keepAlive: true });


let sync_sql = '',
    coolstrs = [],
    starttime = 0;

function MakeRPCRequest(postData) {
  return new Promise(function(resolve, reject) {
    var post_options = {
      host: hostname,
      port: port,
      auth: `${username}:${password}`,
      path: '/',
      method: 'POST',
      agent: keepAliveAgent,
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

  // Loop over vout's
  for (var i = 0; i < tx.vout.length; i++) {
    const vout = tx.vout[i];

    sync_sql += `
      INSERT INTO Vouts (n, value)
      VALUES ("${vout.n}", "${vout.value}");
      SET @voutid= LAST_INSERT_ID();
    `;

    // Loop over addresses in vout
    for (var y = 0; y < vout.scriptPubKey.addresses.length; y++) {
      const address = vout.scriptPubKey.addresses[y];

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

      sync_sql += `
        INSERT INTO AddressVouts (AddressId, VoutId)
        VALUES (@addrid, @voutid);
      `;
    }

    sync_sql += `
      INSERT INTO TransactionVouts (TransactionId, VoutId, direction)
      VALUES (@txid, @voutid, 1);
    `;
  }

  // Loop over vin's
  for (var i = 0; i < tx.vin.length; i++) {
    const vin = tx.vin[i];
    if (vin.txid) {

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

  const res_blockhr = await MakeRPCRequest(JSON.stringify({
    method: 'getnetworkhashps',
    params: [120, height],
    id: 1
  }));
  block.hashrate = JSON.parse(res_blockhr)['result'];

  block.time = moment(block.time*1000).format('YYYY-MM-DD HH:mm:ss');

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
      hashrate,
      previousblockhash
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
      "${block.hashrate}",
      "${block.previousblockhash}"
    );
    `
  coolstrs = []
  for (var i = 0; i < block.tx.length; i++) {
    await saveTransaction(block.tx[i], block.height);
    coolstrs.push(`${block.tx[i]} - ${block.time}`);
  }


  if (block.height > 1) {

    sync_sql += `
      UPDATE Block
      SET nextblockhash="${block.hash}"
      WHERE hash="${block.previousblockhash}";
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
  return JSON.parse(result)['result'] - HeightOffset;
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
    process.exit(0);
  }
}

async function syncBlockchain() {
  try {
    await acquireLock();

    let syncedHeight = await getSyncedHeight();
    console.log('\x1b[36m%s\x1b[0m', 'syncedHeight is', syncedHeight);

    let currentHeight = await getCurrentHeight();
    console.log('\x1b[34m%s\x1b[0m', 'currentHeight is', currentHeight);

    while (syncedHeight < currentHeight) {
      starttime = new Date().getTime();
      syncedHeight = await syncNextBlock(syncedHeight);
      if (coolstrs) {
        for(str of coolstrs) {
          console.log('\x1b[36m%s\x1b[0m', `syncedHeight: ${syncedHeight}/${currentHeight}`,  str, ' [', new Date().getTime() - starttime, 'ms ]')
        }
      } else {
        console.log('\x1b[36m%s\x1b[0m', 'syncedHeight: ', syncedHeight)
      }
    }
  } catch (e) {
    console.log(e);
  } finally {
    await models.sequelize.close();
    process.exit(0);
  }
}

syncBlockchain();
