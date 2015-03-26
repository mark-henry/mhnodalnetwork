(function () {
'use strict';

App.Router.reopen({
  location: 'auto'
});

App.Router.map(function() {
  this.resource('graph', {path: '/graph/:graph_slug'}, function() {
    this.resource('node', {path: '/node/:node_slug'});
  });
});

App.GraphRoute = Ember.Route.extend({
  model: function(params) {
    return this.store.find('graph', params.graph_slug);
  }
});

App.NodeRoute = Ember.Route.extend({
  model: function(params) {
    return this.store.find('node', params.node_slug);
  },
  actions: {
    showModal: function(name, model) {
      return this.render('delete-node-modal', {
        into: 'graph',
        outlet: 'modal',
        model: model
      });
    },
    closeModal: function() {
      return this.disconnectOutlet({
        outlet: 'modal',
        parentView: 'graph'
      });
    }
  }
});

})();