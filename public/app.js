
App = Em.Application.create({
  LOG_TRANSITIONS: true
});

App.Router.reopen({
  location: 'auto'
});

App.Router.map(function() {
  this.resource('graph', {path: '/graph/:graph_id'}, function() {
    this.resource('node', {path: '/node/:node_id'});
  });
});

App.GraphRoute = Ember.Route.extend({
  model: function(params) {
    return {graph_id: params.graph_id};
  }
});

App.NodeRoute = Ember.Route.extend({
  model: function(params) {
    return {node_id: params.node_id};
  }
});