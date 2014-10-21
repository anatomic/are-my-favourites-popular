var AppDispatcher = require('../dispatcher/AppDispatcher');
var Store = require('./Store');
var store2 = require('store2');

var UserStore = new Store();

UserStore.hasAccessToken = function() {
    return UserStore.getAccessToken() && UserStore.hasAccessTokenExpired() === false;
};

UserStore.hasAccessTokenExpired = function() {
    return Date.now() > store2.get('expires_at');
}

UserStore.getAccessToken = function() {
    return store2.get('access_token');
}

UserStore.token = AppDispatcher.register(handleActions);

module.exports = UserStore;

function handleActons(action) {

}
