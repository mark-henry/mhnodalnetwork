var express = require('express');
var app = express();
var neo4j = require('neo4j');
var db = new neo4j.GraphDatabase(process.env['GRAPHSTORY_URL']);

app.set('port', (process.env.PORT || 5000));

app.use('/public', express.static(__dirname + '/public'));

app.use(function (req, res, next) {
  console.log('GET ' + req.path);
  next();
});

app.get('/api/graphs', function(req, res) {
  db.query('MATCH (g:Graph) RETURN g', {}, function(err, result) {
    if (err) throw err;
    result.forEach(function(n) {
      res.send(n['g'].toString());
    });
  });
});

app.get('/api/graphs/:id', function(req, res) {
  var query = 'MATCH (g:Graph {graph_id:' + req.params.id + '}) RETURN g';
  db.query(query, {}, function(err, result) {
    if (err) throw err;
    result.forEach(function(n) {
      res.send(n['g'].toString());
    });
  });
});

app.get('/*', function(req, res) {
  res.sendFile(__dirname + '/public/app.html');
});

app.listen(app.get('port'), function() {
  console.log('Listening on port ' + app.get('port'));
});

