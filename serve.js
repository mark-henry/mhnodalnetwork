var express = require('express');
var app = express();
var neo4j = require('neo4j');
var db = new neo4j.GraphDatabase(process.env['GRAPHSTORY_URL']);

app.set('port', (process.env.PORT || 5000));

app.use('/public', express.static(__dirname + '/public'));

app.get('/*', function(req, res) {
  console.log('GET ' + req.path)
  res.sendFile(__dirname + '/public/app.html');
});

app.listen(app.get('port'), function() {
  console.log('Listening on port ' + app.get('port'));
});