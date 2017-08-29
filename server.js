"use strict"
const express = require('express');
const colors = require('colors');
const http = require('http');
const socketio = require('socket.io');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const settings = require('./settings.js');
const watch = require('watch');

function listFiles(p, data) {
    fs.readdir(p, function (err, files) {
        for (let f of files) {
            //let stats = fs.stat()
            fs.stat(path.join(p, f), function (err, statInfo) {
                if (statInfo.isFile()) {
                    let hash = crypto.createHash('md5');
                    let input = fs.createReadStream(path.join(p, f));

                    input.pipe(hash);
                    hash.on('readable', () => {
                        const dataHash = hash.read();
                        if (dataHash) {
                            data[f] = dataHash.toString('hex');
                            //console.log(f + ' ' + data[f]);
                        }
                    });

                } else if (statInfo.isDirectory() && /^\..*/.test(f) == false) {
                    data[f] = {};
                    listFiles(path.join(p, f), data[f]);
                }
            });
        }
    });
}

function updateDirs(dir, f, workDir, callback) {
    let dirs = f.split(path.sep);
    let realName = dirs.pop();
    let d = dir;

    while (dirs.length > 0) {
        let k = dirs.shift();
        if (/^\..*/.test(k) == true) {
            d = '';
            break;
        }
        if (k in d) {
            d = d[k];
        } else {
            d[k] = {};
            d = d[k];
        }
    }
    if (typeof (d) == 'object') {
        let hash = crypto.createHash('md5');
        let input = fs.createReadStream(path.join(workDir, f));

        input.pipe(hash);
        hash.on('readable', () => {
            const dataHash = hash.read();
            if (dataHash) {
                d[realName] = dataHash.toString('hex');
                //console.log(f + ' ' + data[f]);
                callback(d[realName]);
            }
        });
    }
}

function deleteDirs(dir, f) {
    let dirs = f.split(path.sep);
    let realName = dirs.pop();
    let d = dir;

    while (dirs.length > 0) {
        let k = dirs.shift();
        
        if (k in d) {
            d = d[k];
        } else {
            return;
        }
    }
    if (typeof(d) == 'object' && realName in d) {
        delete d[realName];
    }
}

function loop() {
    const app = express();
    const server = http.Server(app);
    const io = socketio(server);
    const workDir = settings.workDir;
    let dir = {};

    listFiles(workDir, dir);

    app.use('/list', function (req, res) {
        res.status(200).json(dir);
    });

    app.use('/file/*', function (req, res) {
        let dirs = req.params[0].split('/');
        let f = dir;
        while (dirs.length > 0) {
            let k = dirs.shift();
            if (k in f) {
                f = f[k];
            } else {
                break;
            }
        }

        if (typeof (f) == 'string') {
            res.status(200).sendFile(path.resolve(workDir, req.params[0]), {dotfiles: 'allow'}, function (err) {
                if (err) {
                    console.log(`send file ${req.params[0]} failed`.red);
                }
            });
        } else {
            res.status(404).send('FILE NOT FOUND');
        }
    });

    io.on('connection', function (socket) {
        console.log(`socket.io client ${socket.id} connected`.yellow);
        socket.on('list', function (data) {
            socket.emit('listResult', dir);
        });

        socket.on('disconnect', function () {
            console.log(`socket.io client ${socket.id} disconnected`.yellow);
        });
    });

    watch.createMonitor(workDir, function (monitor) {
        monitor.on("created", function (f, stat) {
            // Handle new files
            f = path.relative(workDir, f);
            console.log(`create file ${f}`.green);

            if (stat.isFile()) {
                updateDirs(dir, f, workDir, function(digest) {
                    var payload = {'name':f.split(path.sep).join('/') , 'md5':digest};
                    io.sockets.emit('create', payload);
                });
            }

        });
        monitor.on("changed", function (f, curr, prev) {
            // Handle file changes
            f = path.relative(workDir, f);
            console.log(`change file ${f}`.green);
            updateDirs(dir, f, workDir, function(digest) {
                var payload = {'name':f.split(path.sep).join('/') , 'md5':digest};
                io.sockets.emit('update', payload);
            });
        });
        monitor.on("removed", function (f, stat) {
            // Handle removed files
            f = path.relative(workDir, f);
            console.log(`remove file ${f}`.green);
            deleteDirs(dir, f);
            var payload = {'name':f.split(path.sep).join('/')};
            io.sockets.emit('delete', payload);
        });
    });

    server.listen(settings.port, function () {
        console.log(("Listening on port " + settings.port).green);
    }).on('error', function (e) {
        if (e.code == 'EADDRINUSE') {
            console.log('Address in use. Is the server already running?'.red);
        }
    });
}

console.log(("file sync starting...").green);
loop();