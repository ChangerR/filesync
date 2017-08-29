var path = require('path');

var settings = {
    workDir: path.normalize(path.join(__dirname, 'source')),
    port: process.env.NODE_PORT || 8080 ,
	syncDir : path.normalize(path.join(__dirname, 'dst')),
	server: 'http://192.168.60.220:8080'
};

module.exports = settings;