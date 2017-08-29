"use strict"
const io = require('socket.io-client');
const colors = require('colors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const settings = require('./settings.js');
const workDir = settings.syncDir;
const socket = io(settings.server);
const URL = require('url');

function download(url, filepath) {
    const urlcontent = URL.parse(settings.server);
    const options = {
        hostname: urlcontent.hostname,
        port: urlcontent.port || 80,
        path: '/' + url.split(path.sep).join('/'),
        method: 'GET'
    };
    const req = http.request(options, (res) => {
        //console.log(`STATUS: ${res.statusCode}`);
        //console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
		let output = fs.createWriteStream(filepath);
        res.pipe(output);
    });

    req.on('error', (e) => {
        console.error(`problem with request: ${e.message}`);
    });
	
	req.end();
}

function process(url, md5) {

    let dirs = url.split(path.sep);
    dirs.shift();
    let filename = dirs.pop();

    let dirname = workDir;

    for (let item of dirs) {
        dirname = path.join(dirname, item);
        if (!fs.existsSync(dirname)) {
            fs.mkdirSync(dirname);
        }
    }

    fs.access(path.join(dirname, filename), fs.constants.W_OK, (e) => {
        if (!e) {
            let hash = crypto.createHash('md5');
            let input = fs.createReadStream(path.join(dirname, filename));

            input.pipe(hash);
            hash.on('readable', () => {
                const dataHash = hash.read();
                if (dataHash) {
                    if (md5 != dataHash.toString('hex')) {
						console.log('change ' + url.green + ' ==> ' + md5);
                        download(url, path.join(dirname, filename));
                    }
                }
            });
        } else {
            console.log('create ' + url.green + ' ==> ' + md5);
            download(url, path.join(dirname, filename));
        }
    });
}

function sync(p, data) {
    for (let item in data) {
        let tmp = path.join(p, item);
        if (typeof (data[item]) == 'object') {
            sync(tmp, data[item]);
        } else if (typeof (data[item]) == 'string') {
            process(tmp, data[item]);
        }
    }
}

socket.on('connect', function () {
    console.log("connect to server successful.".green);
    socket.emit('list', {});
});

socket.on('listResult', function (data) {
    //console.log(data);
    sync('file', data);
});

socket.on('create', function (data) {
    process(path.join('file', data['name'].split('/').join(path.sep)), data['md5']);
});

socket.on('update', function (data) {
    process(path.join('file', data['name'].split('/').join(path.sep)), data['md5']);
});

socket.on('delete', function (data) {
    fs.access(path.join(workDir, data['name'].split('/').join(path.sep)), fs.constants.W_OK, (e) => {
		if (!e) {
			fs.unlink(path.join(workDir, data['name'].split('/').join(path.sep)), function(error) {
				console.log(`delete ${data['name']}`.green);
			});
		}
	});
});

