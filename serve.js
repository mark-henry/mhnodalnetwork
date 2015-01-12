//var ember = require('ember');
var express = require('express');

console.log("Loaded requires");

var app = express();
app.set('port', (process.env.PORT || 5000));
app.use('/', express.static(__dirname + '/public'));
app.listen(app.get('port'), function () {
  console.log("App is listening on port " + app.get('port'));
});