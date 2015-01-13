var express = require('express');
var app = express();

console.log('express.js loaded');

app.set('port', (process.env.PORT || 5000));
app.use('/', express.static(__dirname + '/app'));
app.listen(app.get('port'), function () {
  console.log("App is listening on port " + app.get('port'));
});