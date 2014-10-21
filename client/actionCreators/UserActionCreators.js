var request = require('request');

var UserStore = require('../stores/UserStore');

module.exports = {
    logIn: function() {
       if (UserStore.hasAccessToken()) {
           // don't login if we already have a user
       }

       SpotifyAPIUtils.getAccessToken();
    },

    logOut: function() {
        
    }

};
