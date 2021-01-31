Copy config
<pre>
config/config.json.example -> config/config.json
</pre>

Use Mariadb
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
