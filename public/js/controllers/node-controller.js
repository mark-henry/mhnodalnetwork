(function () {
'use strict';

NN.NodeController = Ember.ObjectController.extend({
  needs: 'graph',
  onModelChange: function() {
    // Reach up to the graphcontroller and set which node is selected
    this.get('controllers.graph').set('selectedNode', this.get('model'));
  }.observes('model'),
  actions: {
    addLink: function(nodeToLinkTo) {
      this.model.get('adjacencies').addObject(nodeToLinkTo);
      this.model.save();
    },
    deleteLink: function(link) {
      this.model.get('adjacencies').removeObject(link);
      this.model.save();
    },
    newNodeAndAddLink: function(nodeName) {
      var thisnode = this.get('model');
      this.get('controllers.graph').createNewNode(nodeName)
        .then(function(newNode) {
          thisnode.get('adjacencies').addObject(newNode);
          thisnode.save();
          newNode.save();
        }
      );
    },
    selectNewNodeAndAddLink: function(nodeName) {
      var _this = this;
      var thisNode = this.get('model');
      this.get('controllers.graph').createNewNode(nodeName)
        .then(function(newNode) {
          thisNode.get('adjacencies').addObject(newNode);
          thisNode.save();
          _this.transitionToRoute('node', newNode.get('id'));
        }
      );
    },
    deleteNode: function(node) {
      this.transitionToRoute('graph', this.get('controllers.graph.model'));
      node.destroyRecord();
    }
  },
  onAutoSave: function() {
    if (this.model.get('isDirty') && !this.model.get('isDeleted')) {
      this.model.save();
    }
  },
  autoSave: function() {
    Ember.run.debounce(this, this.onAutoSave, 1500);
  }.observes('name', 'desc')
});

})();