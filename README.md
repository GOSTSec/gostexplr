Use mysql
<pre>
cd gostexplr
npm i
npm run initdb db_root_username db_root_password
npm run syncBlockchain
npm run start
</pre>

In ~/.gostcoin/gostcoin.conf add this parameter
<pre>
blocknotify=/path/to/your/gostexplr/scripts/blocknotify.sh
</pre>

TODO:
 - cut possible -000 from transaction
 - search NOT FOUND message
 - pagination on index page
 - block page by index
 - move database to server
 - setup cron
 - ? transaction connect vout to transaction
 - address balance info
 - lint
 - ES7
