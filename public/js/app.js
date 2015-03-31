NN = window.NN = Ember.Application.create({
  //LOG_TRANSITIONS: true
});

DS.RESTAdapter.reopen({
  namespace: 'api'
});
