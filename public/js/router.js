(function () {
'use strict';

NN.Router.reopen({
  location: 'auto'
});

NN.Router.map(function() {
  this.resource('graph', { path: '/graph/:graph_slug' }, function() {
    this.route('node', function() {
      this.resource('node', { path: '/:node_slug' });
    });
  });
});

NN.GraphRoute = Ember.Route.extend({
  model: function(params) {
    return this.store.find('graph', params.graph_slug);
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

NN.NodeRoute = Ember.Route.extend({
  model: function(params) {
    return this.store.find('node', params.node_slug);
  }
});

})();