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
      this.get('adjacencies').pushObject(nodeToLinkTo);
      this.model.save();
    },
    deleteLink: function(link) {
      this.get('adjacencies').removeObject(link);
      this.model.save();
    },
    newNodeAndAddLink: function(nodeName) {
      var sourceNode = this.get('model');
      this.get('controllers.graph').createNewNode(nodeName)
        .then(function(newNode) {
          sourceNode.get('adjacencies').addObject(newNode);
        }
      );
    },
    selectNewNodeAndAddLink: function(nodeName) {
      var _this = this;
      var sourceNode = this.get('model');
      this.get('controllers.graph').createNewNode(nodeName)
        .then(function(newNode) {
          sourceNode.get('adjacencies').addObject(newNode);
          _this.transitionToRoute('node', newNode.get('id'));
        }
      );
    },
    deleteNode: function(node) {
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