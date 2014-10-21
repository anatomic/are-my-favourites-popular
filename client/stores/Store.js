var EventEmitter = require('events').EventEmitter;
var CHANGE_EVENT = 'change';

class Store extends EventEmitter {
    addChangeListener(cb) {
        this.on(CHANGE_EVENT, cb);
    }

    removeChangeListener(cb) {
        this.off(CHANGE_EVENT, cb);
    }

    emitChange() {
        this.emit(CHANGE_EVENT);
    }
}

module.exports = Store;
