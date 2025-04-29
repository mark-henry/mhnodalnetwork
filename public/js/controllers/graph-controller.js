(function () {
'use strict';

NN.GraphController = Ember.ObjectController.extend({
  actions: {
    selectNode: function(node) {
      this.transitionToRoute('node', node.id);
    },
    'newNode': function(nodeName) {
      var _this = this;
      this.createNewNode(nodeName)
        .then(function(newNode) {
          _this.transitionToRoute('node', newNode.id);
        }
      );
    },
  },
  selectedId: function() {
    return this.get('selectedNode.id');
  }.property('selectedNode'),
  createNewNode: function(nodeName) {
    // Returns: promise for the new node
    var _this = this;
    // Get the current graph identifier (slug) from the controller's model id
    var currentGraphSlug = this.get('id'); // Use 'id' which is populated from 'slug' by the serializer
    // Pass graph_slug along with name when creating the record
    return this.store.createRecord('node', { 
        name: nodeName,
        graph_slug: currentGraphSlug // Add graph context
      }).save()
      .then(function(newNode) {
          _this.get('nodes').addObject(newNode);
          _this.model.save();
          return newNode;
        }
      );
  },

  hasDirty: function() {
    return this.get('nodes').isAny('isDirty', true)
      || this.get('isDirty');
  }.property('nodes.@each.isDirty', 'isDirty'),
  onAutoSave: function() {
    if (this.get('hasDirty')) {
      if (this.get('isDirty')) {
        this.model.save();
      }
      this.get('nodes').filterBy('isDirty', true)
        .forEach(function(node) { node.save(); });
      Ember.run.later(this, this.onAutoSave, 30 * 1000);  // A long retry
    }
  },
  autoSave: function() {
    Ember.run.debounce(this, this.onAutoSave, 1500);
  }.observes('nodes.@each.name', 'nodes.@each.desc')
});

NN.ModalDialogComponent = Ember.Component.extend({
  actions: {
    close: function() {
      this.$('.modal').modal('hide');
      this.sendAction('close');
    }
  },
  show: function() {
    this.$('.modal').modal().on('hidden.bs.modal', function() {
      this.sendAction('close');
    }.bind(this));
  }.on('didInsertElement')
});

})();